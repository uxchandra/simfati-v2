import ExcelJS from "exceljs";

// ===== Format standar import checksheet =====
// 1 sheet = 1 checksheet.
//   A1 "KATEGORI ASET"    B1 <nama kategori aset, harus sudah terdaftar>
//   A2 "NAMA CHECKSHEET"  B2 <nama checksheet>
//   Baris 4: header tabel (BAGIAN | POINT PEMERIKSAAN | METHODA & ALAT CEK | STANDAR)
//   Baris 5 dst: satu baris = satu poin pemeriksaan
// Sheet "PETUNJUK" dan sheet tersembunyi diabaikan.

export const LABEL_KATEGORI = "KATEGORI ASET";
export const LABEL_NAMA = "NAMA CHECKSHEET";
export const HEADER_ROW = 4;
export const HEADERS = ["BAGIAN", "POINT PEMERIKSAAN", "METHODA & ALAT CEK", "STANDAR"] as const;
const GUIDE_SHEET = "PETUNJUK";
const LIST_SHEET = "_KATEGORI";

const MAX = { nama: 150, bagian: 150 };

export type ParsedItem = {
  baris: number;
  bagian: string;
  poin: string;
  metode: string | null;
  standar: string | null;
};

export type ParsedSheet = {
  sheet: string;
  kategori: string;
  name: string;
  items: ParsedItem[];
  errors: string[];
};

// Ambil isi sel sebagai teks bersih (rich text, rumus, hyperlink, tanggal, angka)
export function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return String(v.text ?? "").trim();
    if ("result" in v) return String(v.result ?? "").trim();
    return "";
  }
  return String(v).replace(/\r\n/g, "\n").trim();
}

const normalize = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

function parseSheet(ws: ExcelJS.Worksheet): ParsedSheet {
  const errors: string[] = [];
  const text = (row: number, col: number) => cellText(ws.getCell(row, col));

  // Label wajib di kolom A, nilai di kolom B
  if (normalize(text(1, 1)) !== LABEL_KATEGORI) errors.push(`Sel A1 harus berisi "${LABEL_KATEGORI}"`);
  if (normalize(text(2, 1)) !== LABEL_NAMA) errors.push(`Sel A2 harus berisi "${LABEL_NAMA}"`);

  const kategori = text(1, 2);
  const name = text(2, 2);
  if (!kategori) errors.push("Kategori aset (sel B1) wajib diisi");
  if (!name) errors.push("Nama checksheet (sel B2) wajib diisi");
  if (name.length > MAX.nama) errors.push(`Nama checksheet maksimal ${MAX.nama} karakter`);

  HEADERS.forEach((header, i) => {
    const actual = text(HEADER_ROW, i + 1);
    if (normalize(actual) !== header) {
      const col = String.fromCharCode(65 + i);
      errors.push(`Header ${col}${HEADER_ROW} harus "${header}"${actual ? `, ditemukan "${actual}"` : ""}`);
    }
  });

  const items: ParsedItem[] = [];

  // Label & header semuanya salah: hampir pasti bukan file template (mis. form checksheet lama)
  const labelsMissing = errors.filter((e) => e.startsWith("Sel A")).length === 2;
  const headersWrong = errors.filter((e) => e.startsWith("Header")).length === HEADERS.length;
  if (labelsMissing && headersWrong) {
    return {
      sheet: ws.name,
      kategori: "",
      name: "",
      items,
      errors: ["Format sheet tidak sesuai template checksheet. Download template terlebih dahulu"],
    };
  }

  // Kalau header salah, kolom data tidak bisa dipercaya
  if (errors.some((e) => e.startsWith("Header"))) return { sheet: ws.name, kategori, name, items, errors };

  // Posisi terakhir tiap bagian, untuk memastikan baris satu bagian tidak terpisah-pisah
  const lastRowOfBagian = new Map<string, number>();
  let prevBagian = "";

  // rowCount exceljs dihitung ulang tiap dipanggil, jadi simpan sekali
  const rowCount = ws.rowCount;
  for (let r = HEADER_ROW + 1; r <= rowCount; r++) {
    const [bagian, poin, metode, standar] = [1, 2, 3, 4].map((c) => text(r, c));
    if (!bagian && !poin && !metode && !standar) continue;

    if (!bagian) errors.push(`Baris ${r}: BAGIAN wajib diisi`);
    if (!poin) errors.push(`Baris ${r}: POINT PEMERIKSAAN wajib diisi`);
    if (bagian.length > MAX.bagian) errors.push(`Baris ${r}: BAGIAN maksimal ${MAX.bagian} karakter`);

    const key = normalize(bagian);
    if (bagian && key !== prevBagian && lastRowOfBagian.has(key)) {
      errors.push(
        `Baris ${r}: bagian "${bagian}" sudah muncul di baris ${lastRowOfBagian.get(key)}, kelompokkan baris dengan bagian yang sama`,
      );
    }
    if (bagian) {
      lastRowOfBagian.set(key, r);
      prevBagian = key;
    }

    items.push({ baris: r, bagian, poin, metode: metode || null, standar: standar || null });
  }

  if (items.length === 0) errors.push(`Belum ada poin pemeriksaan (mulai baris ${HEADER_ROW + 1})`);

  return { sheet: ws.name, kategori, name, items, errors };
}

export async function parseChecksheetWorkbook(buffer: Buffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs butuh ArrayBuffer-like; Buffer dari express.raw sudah cocok
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  return wb.worksheets
    .filter((ws) => ws.state === "visible" && normalize(ws.name) !== GUIDE_SHEET && ws.name !== LIST_SHEET)
    .filter((ws) => ws.actualRowCount > 0)
    .map(parseSheet);
}

// ===== Pembuatan file template =====

type TemplateSheet = {
  sheetName: string;
  kategori: string;
  name: string;
  items: Omit<ParsedItem, "baris">[];
};

const thin = { style: "thin" } as const;
const border = { top: thin, left: thin, bottom: thin, right: thin };

function addChecksheetSheet(wb: ExcelJS.Workbook, data: TemplateSheet, kategoriCount: number) {
  const ws = wb.addWorksheet(data.sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  ws.columns = [{ width: 32 }, { width: 45 }, { width: 28 }, { width: 50 }];

  ws.getCell("A1").value = LABEL_KATEGORI;
  ws.getCell("B1").value = data.kategori;
  ws.getCell("A2").value = LABEL_NAMA;
  ws.getCell("B2").value = data.name;
  for (const addr of ["A1", "A2"]) ws.getCell(addr).font = { bold: true };
  for (const addr of ["B1", "B2"]) {
    ws.getCell(addr).border = border;
    ws.getCell(addr).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  }

  // Dropdown kategori aset dari daftar yang terdaftar di sistem
  if (kategoriCount > 0) {
    ws.getCell("B1").dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'${LIST_SHEET}'!$A$1:$A$${kategoriCount}`],
      showErrorMessage: true,
      errorTitle: "Kategori tidak dikenal",
      error: "Pilih kategori aset dari daftar",
    };
  }

  const header = ws.getRow(HEADER_ROW);
  HEADERS.forEach((h, i) => {
    const cell = header.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = border;
  });

  data.items.forEach((item, i) => {
    const row = ws.getRow(HEADER_ROW + 1 + i);
    row.values = [item.bagian, item.poin, item.metode ?? "", item.standar ?? ""];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = border;
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
}

function addGuideSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(GUIDE_SHEET);
  ws.columns = [{ width: 110 }];
  const lines = [
    "PETUNJUK IMPORT CHECKSHEET",
    "",
    "1. Satu sheet = satu checksheet. Untuk import beberapa checksheet sekaligus, copy sheet contoh dan ganti nama sheet-nya.",
    `2. Sel B1 (${LABEL_KATEGORI}) diisi nama kategori aset yang sudah terdaftar di sistem (pilih dari dropdown).`,
    `3. Sel B2 (${LABEL_NAMA}) diisi nama checksheet, mis. "Checksheet Stamping AIDA 150T".`,
    "   Kalau nama checksheet sudah ada di kategori yang sama, isi poin pemeriksaannya akan DIGANTI dengan isi file ini.",
    `4. Jangan ubah posisi label (A1, A2) dan header tabel (baris ${HEADER_ROW}).`,
    `5. Isi data mulai baris ${HEADER_ROW + 1}, satu baris = satu poin pemeriksaan.`,
    "6. BAGIAN dan POINT PEMERIKSAAN wajib diisi di SETIAP baris. METHODA & ALAT CEK dan STANDAR boleh kosong.",
    "7. Baris dengan BAGIAN yang sama harus berurutan (tidak terpisah oleh bagian lain).",
    "8. Nomor poin (1.1, 1.2, ...) tidak perlu diisi, sistem membuatnya otomatis dari urutan baris.",
    `9. Sheet "${GUIDE_SHEET}" ini tidak ikut di-import.`,
  ];
  lines.forEach((line, i) => {
    const cell = ws.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true };
    if (i === 0) cell.font = { bold: true, size: 14 };
  });
}

export async function buildChecksheetWorkbook(kategoriNames: string[], sheets: TemplateSheet[]) {
  const wb = new ExcelJS.Workbook();
  addGuideSheet(wb);

  for (const sheet of sheets) addChecksheetSheet(wb, sheet, kategoriNames.length);

  // Daftar kategori untuk dropdown, disembunyikan dari user
  const list = wb.addWorksheet(LIST_SHEET, { state: "veryHidden" });
  kategoriNames.forEach((name, i) => (list.getCell(i + 1, 1).value = name));

  // Buka langsung di sheet checksheet pertama
  wb.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: sheets.length ? 1 : 0, visibility: "visible" }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildTemplate(kategoriNames: string[]) {
  return buildChecksheetWorkbook(kategoriNames, [
    {
      sheetName: "Checksheet 1",
      kategori: kategoriNames[0] ?? "",
      name: "",
      items: [
        { bagian: "Elektrik & Panel Operasi", poin: "Kondisi Transformer", metode: "Measure Check", standar: "380 V / 220 V" },
        { bagian: "Elektrik & Panel Operasi", poin: "Kondisi Lampu Indikator", metode: "Visual dan Measure Check", standar: "Berfungsi Normal" },
        { bagian: "Motor", poin: "Kondisi Motor Servo Axis", metode: "Visual dan Trial Check", standar: "Volt, Ampere Sesuai Standard" },
      ],
    },
  ]);
}
