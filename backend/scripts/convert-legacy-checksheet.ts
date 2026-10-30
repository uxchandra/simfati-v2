// Konversi file checksheet lama (form cetak, posisi kolom tidak konsisten) ke format template import.
// Pemakaian:
//   npx tsx scripts/convert-legacy-checksheet.ts "<file lama.xlsx>" "<Nama Kategori Aset>" [output.xlsx]
//
// Cara kerja:
// - Tiap sheet dicari baris header yang berisi "BAGIAN" dan "POINT PEMERIKSAAN" (posisi kolom bebas).
// - Satu sheet bisa berisi banyak blok mesin (NOMOR MESIN : ...), masing-masing dibaca terpisah.
// - Blok dengan isi poin pemeriksaan yang identik digabung jadi satu checksheet.
// - Sheet yang bukan checksheet preventive (tidak ada header di atas) dilewati.
// Hasilnya WAJIB dicek dulu (terutama NAMA CHECKSHEET) sebelum di-import lewat sistem.
import ExcelJS from "exceljs";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { buildChecksheetWorkbook, cellText } from "../src/lib/checksheet-excel";

type Item = { bagian: string; poin: string; metode: string | null; standar: string | null };
type Block = { mesin: string; items: Item[] };

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

// Sinonim label kolom di form lama
const COLUMN_LABELS = {
  bagian: ["BAGIAN"],
  poin: ["POINT PEMERIKSAAN", "POIN PEMERIKSAAN"],
  metode: ["METHODA & ALAT CEK", "METODA & ALAT CEK", "METODE & ALAT CEK", "METHODA DAN ALAT CEK"],
  standar: ["STANDAR", "STANDARD"],
};
type Field = keyof typeof COLUMN_LABELS;

// Nomor poin seperti 1.1 / 1.10 / 3,8
const isNumbering = (s: string) => /^\d+([.,]\d+)*\.?$/.test(s);

// Rentang kolom sebuah sel (lebih dari 1 kolom kalau di-merge)
function columnSpan(ws: ExcelJS.Worksheet, row: number, col: number): number[] {
  // exceljs tidak mengekspos daftar merge di tipe publiknya
  type MergeRange = { model: { top: number; bottom: number; left: number; right: number } };
  for (const range of Object.values((ws as unknown as { _merges: Record<string, MergeRange> })._merges)) {
    const { top, bottom, left, right } = range.model;
    if (row >= top && row <= bottom && col >= left && col <= right) {
      return Array.from({ length: right - left + 1 }, (_, i) => left + i);
    }
  }
  return [col];
}

// Cari kolom untuk tiap field di baris header; null kalau baris ini bukan header
function detectHeader(ws: ExcelJS.Worksheet, rowNo: number, columnCount: number): Record<Field, number[]> | null {
  const found: Partial<Record<Field, number[]>> = {};
  const row = ws.getRow(rowNo);
  for (let c = 1; c <= columnCount; c++) {
    const text = norm(cellText(row.getCell(c)));
    if (!text) continue;
    for (const [field, labels] of Object.entries(COLUMN_LABELS) as [Field, string[]][]) {
      if (!found[field] && labels.includes(text)) found[field] = columnSpan(ws, rowNo, c);
    }
  }
  if (!found.bagian || !found.poin) return null;
  return { bagian: found.bagian, poin: found.poin, metode: found.metode ?? [], standar: found.standar ?? [] };
}

// Nilai pertama yang terisi dalam rentang kolom (sel merge dibaca sekali)
function firstValue(ws: ExcelJS.Worksheet, rowNo: number, cols: number[], skipNumbering = false) {
  const seen = new Set<string>();
  for (const c of cols) {
    const text = cellText(ws.getCell(rowNo, c));
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (skipNumbering && isNumbering(text)) continue;
    return text;
  }
  return "";
}

function readBlocks(ws: ExcelJS.Worksheet): Block[] {
  const blocks: Block[] = [];
  let mesin = "";
  let current: { block: Block; cols: Record<Field, number[]>; bagian: string } | null = null;
  // rowCount/columnCount exceljs dihitung ulang tiap dipanggil (lambat untuk sheet ribuan baris), jadi simpan sekali
  const rowCount = ws.rowCount;
  const columnCount = ws.columnCount;

  for (let r = 1; r <= rowCount; r++) {
    const firstCell = norm(cellText(ws.getCell(r, 1)));

    // Info mesin di atas header, mis. "NOMOR MESIN : PT.81 (AIDA 150T)"
    for (let c = 1; c <= Math.min(columnCount, 10); c++) {
      const text = cellText(ws.getCell(r, c));
      if (norm(text).startsWith("NOMOR MESIN")) mesin = text.split(":").slice(1).join(":").trim();
    }

    const header = detectHeader(ws, r, columnCount);
    if (header) {
      current = { block: { mesin, items: [] }, cols: header, bagian: "" };
      blocks.push(current.block);
      continue;
    }
    if (!current) continue;

    // Akhir tabel: legenda simbol / catatan
    if (firstCell.startsWith("SYMBOL") || firstCell.startsWith("CATATAN")) {
      current = null;
      continue;
    }

    const bagian = firstValue(ws, r, current.cols.bagian);
    if (bagian) current.bagian = bagian; // di form lama BAGIAN hanya diisi di baris pertama grup
    const poin = firstValue(ws, r, current.cols.poin, true);
    if (!poin) continue;

    current.block.items.push({
      bagian: current.bagian,
      poin,
      metode: firstValue(ws, r, current.cols.metode) || null,
      standar: firstValue(ws, r, current.cols.standar) || null,
    });
  }

  return blocks.filter((b) => b.items.length > 0);
}

const signature = (items: Item[]) => JSON.stringify(items.map((i) => [norm(i.bagian), norm(i.poin), norm(i.metode ?? ""), norm(i.standar ?? "")]));
// "PT.81 (AIDA 150T)" -> "PT.81"
const machineCode = (mesin: string) => mesin.split(/\s|\(/)[0] || mesin;

async function main() {
  const [input, kategori, output] = process.argv.slice(2);
  if (!input || !kategori) {
    console.error('Pemakaian: npx tsx scripts/convert-legacy-checksheet.ts "<file.xlsx>" "<Kategori Aset>" [output.xlsx]');
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input);

  const sheets: Parameters<typeof buildChecksheetWorkbook>[1] = [];

  for (const ws of wb.worksheets) {
    const blocks = readBlocks(ws);
    if (blocks.length === 0) {
      console.log(`- Sheet "${ws.name}": dilewati (bukan format checksheet preventive)`);
      continue;
    }

    // Gabungkan blok mesin yang isinya identik
    const groups = new Map<string, { items: Item[]; mesin: string[] }>();
    for (const block of blocks) {
      const key = signature(block.items);
      if (!groups.has(key)) groups.set(key, { items: block.items, mesin: [] });
      if (block.mesin) groups.get(key)!.mesin.push(machineCode(block.mesin));
    }

    let variant = 0;
    for (const group of groups.values()) {
      variant++;
      const suffix = groups.size > 1 ? ` (${group.mesin.join(", ") || `Variasi ${variant}`})` : "";
      const name = `${ws.name.trim()}${suffix}`.slice(0, 150);
      const sheetName = (groups.size > 1 ? `${ws.name.trim()} ${variant}` : ws.name.trim()).slice(0, 31);

      sheets.push({ sheetName, kategori, name, items: group.items });
      console.log(
        `- Sheet "${ws.name}" -> "${name}": ${group.items.length} poin, dipakai ${group.mesin.length} mesin` +
          (group.mesin.length ? ` (${group.mesin.join(", ")})` : ""),
      );
    }
  }

  if (sheets.length === 0) {
    console.error("Tidak ada checksheet yang bisa dikonversi");
    process.exit(1);
  }

  const outFile = output ?? path.join(path.dirname(input), `${path.parse(input).name} - IMPORT.xlsx`);
  await writeFile(outFile, await buildChecksheetWorkbook([kategori], sheets));
  console.log(`\nSelesai: ${sheets.length} checksheet ditulis ke ${outFile}`);
}

main();
