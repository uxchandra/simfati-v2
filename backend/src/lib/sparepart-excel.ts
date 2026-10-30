import ExcelJS from "exceljs";
import { cellText } from "./checksheet-excel";

// ===== Format import sparepart =====
// Sheet pertama yang terlihat. Baris pertama = header, data mulai baris kedua.
// Urutan kolom bebas, dikenali dari nama header (lihat ALIASES).

export const COLUMNS = [
  { key: "kodeBarang", header: "KODE BARANG", width: 18 },
  { key: "namaBarang", header: "NAMA BARANG", width: 35 },
  { key: "spec", header: "SPEC", width: 25 },
  { key: "stok", header: "STOK", width: 10 },
  { key: "minimalStok", header: "MINIMAL STOK", width: 14 },
  { key: "maksimalStok", header: "MAKSIMAL STOK", width: 15 },
  { key: "uom", header: "UOM", width: 10 },
  { key: "keterangan", header: "KETERANGAN", width: 40 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

// Nama header yang diterima (huruf kecil, tanpa spasi/tanda baca)
const ALIASES: Record<ColumnKey, string[]> = {
  kodeBarang: ["kodebarang", "kode", "kodesparepart", "partno", "partnumber"],
  namaBarang: ["namabarang", "nama", "namasparepart", "sparepart"],
  spec: ["spec", "spesifikasi", "specification"],
  stok: ["stok", "stock", "qty", "jumlah"],
  minimalStok: ["minimalstok", "minstok", "minimumstok", "minstock", "min"],
  maksimalStok: ["maksimalstok", "maksstok", "maxstok", "maximumstok", "maxstock", "max", "maks"],
  uom: ["uom", "satuan", "unit"],
  keterangan: ["keterangan", "ket", "remark", "remarks", "catatan"],
};

const TEXT_MAX: Partial<Record<ColumnKey, number>> = {
  kodeBarang: 255,
  namaBarang: 255,
  spec: 255,
  uom: 50,
};

const INT_COLUMNS = ["stok", "minimalStok", "maksimalStok"] as const;
const HEADER_SCAN_ROWS = 10;

export type ParsedRow = {
  baris: number;
  kodeBarang: string;
  namaBarang: string | null;
  spec: string | null;
  stok: number | null;
  minimalStok: number | null;
  maksimalStok: number | null;
  uom: string | null;
  keterangan: string | null;
  errors: string[];
};

const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function matchColumn(header: string): ColumnKey | undefined {
  const h = normalizeHeader(header);
  if (!h) return undefined;
  return (Object.keys(ALIASES) as ColumnKey[]).find((key) => ALIASES[key].includes(h));
}

// Cari baris header di beberapa baris teratas (file kadang punya judul di atas tabel)
function findHeader(ws: ExcelJS.Worksheet) {
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); r++) {
    const map = new Map<ColumnKey, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const key = matchColumn(cellText(cell));
      if (key && !map.has(key)) map.set(key, col);
    });
    if (map.has("kodeBarang")) return { row: r, map };
  }
  return null;
}

function parseInteger(text: string, label: string, errors: string[]) {
  if (!text) return null;
  const value = Number(text.replace(/,/g, ""));
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${label} harus bilangan bulat ≥ 0 (isi: "${text}")`);
    return null;
  }
  return value;
}

export async function parseSparepartWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const ws = wb.worksheets.find((s) => s.state === "visible" && s.actualRowCount > 0);
  if (!ws) return { error: "File Excel kosong" } as const;

  const header = findHeader(ws);
  if (!header) {
    return { error: 'Kolom "KODE BARANG" tidak ditemukan. Gunakan template import sparepart' } as const;
  }

  const rows: ParsedRow[] = [];
  const rowCount = ws.rowCount;

  for (let r = header.row + 1; r <= rowCount; r++) {
    const text = (key: ColumnKey) => {
      const col = header.map.get(key);
      return col ? cellText(ws.getCell(r, col)) : "";
    };

    const values = Object.fromEntries(COLUMNS.map((c) => [c.key, text(c.key)])) as Record<ColumnKey, string>;
    if (Object.values(values).every((v) => !v)) continue;

    const errors: string[] = [];
    if (!values.kodeBarang) errors.push("KODE BARANG wajib diisi");

    for (const [key, max] of Object.entries(TEXT_MAX) as [ColumnKey, number][]) {
      if (values[key].length > max) errors.push(`${COLUMNS.find((c) => c.key === key)!.header} maksimal ${max} karakter`);
    }

    const [stok, minimalStok, maksimalStok] = INT_COLUMNS.map((key) =>
      parseInteger(values[key], COLUMNS.find((c) => c.key === key)!.header, errors),
    );

    if (minimalStok !== null && maksimalStok !== null && minimalStok > maksimalStok) {
      errors.push("MINIMAL STOK tidak boleh lebih besar dari MAKSIMAL STOK");
    }

    rows.push({
      baris: r,
      kodeBarang: values.kodeBarang,
      namaBarang: values.namaBarang || null,
      spec: values.spec || null,
      stok,
      minimalStok,
      maksimalStok,
      uom: values.uom || null,
      keterangan: values.keterangan || null,
      errors,
    });
  }

  if (rows.length === 0) return { error: `Belum ada data sparepart (mulai baris ${header.row + 1})` } as const;

  return { rows } as const;
}

// ===== Template =====

export async function buildSparepartTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sparepart", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const thin = { style: "thin" } as const;
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });

  ws.addRow({
    kodeBarang: "SP-001",
    namaBarang: "Handy Switch Musashi",
    spec: "LS-3T-1604P",
    stok: 0,
    minimalStok: 2,
    maksimalStok: 3,
    uom: "PCS",
    keterangan: "Contoh, hapus baris ini sebelum import",
  });

  const guide = wb.addWorksheet("PETUNJUK");
  guide.columns = [{ width: 100 }];
  [
    "PETUNJUK IMPORT SPAREPART",
    "",
    "1. Isi data di sheet \"Sparepart\" mulai baris 2. Satu baris = satu sparepart.",
    "2. KODE BARANG wajib diisi dan tidak boleh dobel di dalam file.",
    "3. Jika KODE BARANG sudah ada di sistem, datanya akan DIPERBARUI dengan isi file ini.",
    "4. STOK, MINIMAL STOK, dan MAKSIMAL STOK diisi bilangan bulat (boleh kosong).",
    "5. Kolom lain boleh kosong. Urutan kolom boleh berbeda selama nama header sama.",
  ].forEach((line, i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
