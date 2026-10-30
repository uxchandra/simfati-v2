import ExcelJS from "exceljs";
import { cellText } from "./checksheet-excel";

// ===== Format import asset (per kategori aset) =====
// Sheet pertama yang terlihat. Baris header dicari di 10 baris teratas (harus ada kolom KODE).
// Urutan kolom bebas, dikenali dari nama header. Kategori ditentukan dari submenu tempat import, bukan dari file.

export type AssetTextKey =
  | "description"
  | "lane"
  | "kapasitas"
  | "model"
  | "tahunPembuatan"
  | "nomorSeri"
  | "power"
  | "tglInstal"
  | "keterangan"
  | "capacityKn"
  | "slideStroke"
  | "strokePerMinute"
  | "dieHeight"
  | "slideAdjustment"
  | "slideArea"
  | "bolsterArea"
  | "mainMotor"
  | "reqAirPressure"
  | "maxUpperDieWeight"
  | "powerSource"
  | "brakingTime";

type ColumnKey = "kode" | "status" | AssetTextKey;

type Column = { key: ColumnKey; header: string; width: number; max?: number; aliases?: string[] };

// Header template = label di form asset
export const COLUMNS: Column[] = [
  { key: "kode", header: "KODE", width: 16, max: 50, aliases: ["kodeasset", "kodeaset", "kodemesin", "assetcode", "code"] },
  { key: "status", header: "STATUS", width: 11 },
  { key: "model", header: "MODEL", width: 20, max: 100 },
  { key: "nomorSeri", header: "NOMOR SERI", width: 18, max: 100, aliases: ["noseri", "serialnumber", "serialno", "sn"] },
  { key: "tahunPembuatan", header: "TAHUN PEMBUATAN", width: 17, max: 10, aliases: ["tahun", "year"] },
  { key: "tglInstal", header: "TANGGAL INSTAL", width: 16, max: 100, aliases: ["tglinstal", "tanggalinstalasi", "installdate"] },
  { key: "lane", header: "LANE", width: 12, max: 100, aliases: ["line"] },
  { key: "kapasitas", header: "KAPASITAS", width: 14, max: 100, aliases: ["capacity"] },
  { key: "power", header: "POWER", width: 12, max: 100, aliases: ["daya"] },
  { key: "description", header: "DESKRIPSI", width: 30, aliases: ["description", "nama", "namaasset", "namamesin"] },
  { key: "keterangan", header: "KETERANGAN", width: 30, aliases: ["ket", "remark", "remarks", "catatan"] },
  { key: "capacityKn", header: "CAPACITY (KN)", width: 15, max: 100 },
  { key: "slideStroke", header: "SLIDE STROKE", width: 14, max: 100 },
  { key: "strokePerMinute", header: "STROKE PER MINUTE", width: 18, max: 100, aliases: ["spm"] },
  { key: "dieHeight", header: "DIE HEIGHT", width: 13, max: 100 },
  { key: "slideAdjustment", header: "SLIDE ADJUSTMENT", width: 17, max: 100 },
  { key: "slideArea", header: "SLIDE AREA", width: 13, max: 100 },
  { key: "bolsterArea", header: "BOLSTER AREA", width: 14, max: 100 },
  { key: "mainMotor", header: "MAIN MOTOR", width: 13, max: 100 },
  { key: "reqAirPressure", header: "REQ. AIR PRESSURE", width: 18, max: 100, aliases: ["airpressure"] },
  { key: "maxUpperDieWeight", header: "MAX UPPER DIE WEIGHT", width: 21, max: 100 },
  { key: "powerSource", header: "POWER SOURCE", width: 14, max: 100 },
  { key: "brakingTime", header: "BRAKING TIME", width: 14, max: 100 },
];

const TEXT_COLUMNS = COLUMNS.filter((c) => c.key !== "kode" && c.key !== "status") as (Column & {
  key: AssetTextKey;
})[];

const HEADER_SCAN_ROWS = 10;

const STATUS_VALUES: Record<string, "active" | "inactive"> = {
  active: "active",
  aktif: "active",
  inactive: "inactive",
  nonactive: "inactive",
  nonaktif: "inactive",
  tidakaktif: "inactive",
};

export type ParsedAssetRow = {
  baris: number;
  kode: string;
  status: "active" | "inactive";
  errors: string[];
} & Record<AssetTextKey, string | null>;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Header dikenali dari label template, nama field (mis. "nomorSeri"), atau alias
const headerLookup = new Map<string, ColumnKey>();
for (const c of COLUMNS) {
  for (const name of [c.header, c.key, ...(c.aliases ?? [])]) headerLookup.set(normalize(name), c.key);
}

function findHeader(ws: ExcelJS.Worksheet) {
  for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); r++) {
    const map = new Map<ColumnKey, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const key = headerLookup.get(normalize(cellText(cell)));
      if (key && !map.has(key)) map.set(key, col);
    });
    if (map.has("kode")) return { row: r, map };
  }
  return null;
}

export async function parseAssetWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const ws = wb.worksheets.find((s) => s.state === "visible" && s.actualRowCount > 0);
  if (!ws) return { error: "File Excel kosong" } as const;

  const header = findHeader(ws);
  if (!header) return { error: 'Kolom "KODE" tidak ditemukan. Gunakan template import asset' } as const;

  const rows: ParsedAssetRow[] = [];
  const rowCount = ws.rowCount;

  for (let r = header.row + 1; r <= rowCount; r++) {
    const text = (key: ColumnKey) => {
      const col = header.map.get(key);
      return col ? cellText(ws.getCell(r, col)) : "";
    };

    const values = Object.fromEntries(COLUMNS.map((c) => [c.key, text(c.key)])) as Record<ColumnKey, string>;
    if (Object.values(values).every((v) => !v)) continue;

    const errors: string[] = [];
    if (!values.kode) errors.push("KODE wajib diisi");

    for (const c of COLUMNS) {
      if (c.max && values[c.key].length > c.max) errors.push(`${c.header} maksimal ${c.max} karakter`);
    }

    // Status kosong = active
    let status: "active" | "inactive" = "active";
    if (values.status) {
      const found = STATUS_VALUES[normalize(values.status)];
      if (found) status = found;
      else errors.push(`STATUS harus "active" atau "inactive" (isi: "${values.status}")`);
    }

    rows.push({
      baris: r,
      kode: values.kode,
      status,
      errors,
      ...(Object.fromEntries(TEXT_COLUMNS.map((c) => [c.key, values[c.key] || null])) as Record<
        AssetTextKey,
        string | null
      >),
    });
  }

  if (rows.length === 0) return { error: `Belum ada data asset (mulai baris ${header.row + 1})` } as const;

  return { rows } as const;
}

// ===== Template =====

export async function buildAssetTemplate(categoryName: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Asset", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const thin = { style: "thin" } as const;
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });

  // Dropdown status untuk 1000 baris pertama
  for (let r = 2; r <= 1001; r++) {
    ws.getCell(r, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"active,inactive"'],
      showErrorMessage: true,
      errorTitle: "Status tidak valid",
      error: "Pilih active atau inactive",
    };
  }

  ws.addRow({ kode: "CONTOH-001", status: "active", model: "Contoh, hapus baris ini sebelum import" });

  const guide = wb.addWorksheet("PETUNJUK");
  guide.columns = [{ width: 110 }];
  [
    `PETUNJUK IMPORT ASSET - ${categoryName.toUpperCase()}`,
    "",
    `1. Semua baris di file ini akan masuk ke kategori "${categoryName}" (sesuai submenu tempat import).`,
    '2. Isi data di sheet "Asset" mulai baris 2. Satu baris = satu asset.',
    "3. KODE wajib diisi, maksimal 50 karakter, dan tidak boleh dobel.",
    "4. Jika KODE sudah ada di kategori ini, datanya akan DIPERBARUI dengan isi file (sel kosong = dikosongkan).",
    "5. KODE yang sudah dipakai asset di kategori lain akan ditolak.",
    "6. STATUS diisi active / inactive. Jika kosong dianggap active.",
    "7. Kolom lain boleh kosong. Kolom yang tidak dipakai kategori ini boleh dihapus.",
  ].forEach((line, i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
