// Import file "INVENTARIS MESIN 2026" (format form MFD / FMR / 1) ke tabel asset, sesuai kategori per sheet.
//
// Pemakaian (dari folder backend):
//   npx tsx scripts/import-inventaris-mesin.ts "<file.xlsx>"            -> PREVIEW saja (tidak menyimpan)
//   npx tsx scripts/import-inventaris-mesin.ts "<file.xlsx>" --apply    -> simpan ke database
//   tambahan: --no-db  (preview tanpa koneksi database, cuma baca file)
//
// Preview selalu menulis file "<nama file>.preview.xlsx" di sebelah file input: cek dulu sebelum --apply.
//
// Pemetaan sheet -> kategori aset (kategori dicari dari nama/alias, kalau belum ada dibuat saat --apply):
//   REV.11(STAMPING)      -> Stamping
//   REV.11(SPOT WELDING)  -> Spot Welding
//   P2+GEOMET(2025)       -> Plant 2 & Geomet   (lane = GEOMET / RINGGU MAKI / COATING / ASSEMBLING / SUPPORT)
//   Utility               -> Utility
//   GEN MAINT UNCOILER    -> Uncoiler           (kode = "UNC <no mesin>", karena kode press-nya sudah dipakai di Stamping)
//
// Aturan pembersihan data:
// - Baris "Uncoiler" di bawah press pada sheet Stamping tidak masuk Stamping; uncoiler diambil dari sheet
//   GEN MAINT UNCOILER. Uncoiler yang cuma ada di sheet Stamping (tidak ketemu by no mesin / nomor seri) ikut
//   ditambahkan ke kategori Uncoiler.
// - Baris "Box Changer" / "Conveyor output" di bawah press jadi asset sendiri: kode "<press> BOX CHANGER", lane = press.
// - Mesin yang dijual / dibongkar ("Sold to ...", "dibongkar ...") -> status inactive, catatannya masuk KETERANGAN.
// - Kode kembar (tidak membedakan huruf besar/kecil) diberi akhiran " (SOLD)" untuk mesin terjual, selain itu " (2)", " (3)".
// - Kode yang sudah ada di kategori yang sama -> DIPERBARUI. Kode yang sudah dipakai di kategori lain -> dilewati.
import ExcelJS from "exceljs";
import path from "node:path";

// ===== Tipe =====

type TextKey =
  | "description" | "lane" | "kapasitas" | "model" | "tahunPembuatan" | "nomorSeri" | "power" | "tglInstal"
  | "keterangan" | "capacityKn" | "slideStroke" | "strokePerMinute" | "dieHeight" | "slideAdjustment"
  | "slideArea" | "bolsterArea" | "mainMotor" | "reqAirPressure" | "maxUpperDieWeight" | "powerSource"
  | "brakingTime";

type AssetRow = {
  sheet: string;
  baris: number;
  kode: string;
  status: "active" | "inactive";
} & Partial<Record<TextKey, string | null>>;

type CategoryDef = { key: string; name: string; aliases: string[]; sheet: RegExp };

const CATEGORIES: CategoryDef[] = [
  { key: "stamping", name: "Stamping", aliases: ["stamping", "mesinstamping", "press", "mesinpress"], sheet: /STAMPING/i },
  { key: "spot", name: "Spot Welding", aliases: ["spotwelding", "spotweldingrivet", "welding", "spot"], sheet: /SPOT/i },
  {
    key: "p2",
    name: "Plant 2 & Geomet",
    aliases: ["plant2geomet", "plant2", "p2", "p2geomet", "geomet", "plant2dangeomet"],
    sheet: /P2|GEOMET/i,
  },
  { key: "utility", name: "Utility", aliases: ["utility", "utilitysupport", "equipmentutility"], sheet: /UTILITY/i },
  { key: "uncoiler", name: "Uncoiler", aliases: ["uncoiler", "uncoilerfeeder", "feeder"], sheet: /UNCOILER/i },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const kodeKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ===== Konversi nilai sel =====

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const pad = (n: number) => String(n).padStart(2, "0");
const serialToDate = (serial: number) => new Date(EXCEL_EPOCH + Math.round(serial) * 86_400_000);
const dateToSerial = (d: Date) => Math.round((d.getTime() - EXCEL_EPOCH) / 86_400_000);

type Kind = "text" | "year" | "date";

function rawValue(cell: ExcelJS.Cell): unknown {
  // Sel bagian dari merge (bukan sel utamanya) dianggap kosong, supaya header ber-merge tidak terbaca jadi data
  if (cell.isMerged && cell.master.address !== cell.address) return null;
  const v = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return v.result;
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}

function fmt(v: unknown, kind: Kind = "text"): string | null {
  if (v === null || v === undefined) return null;

  if (v instanceof Date) {
    // Tanggal tahun 1900-an = angka tahun (mis. 2013) yang terlanjur diformat tanggal di Excel
    if (v.getUTCFullYear() < 1910) return String(dateToSerial(v));
    const mm = pad(v.getUTCMonth() + 1);
    const yyyy = v.getUTCFullYear();
    return kind === "year" ? `${mm}-${yyyy}` : `${pad(v.getUTCDate())}-${mm}-${yyyy}`;
  }

  if (typeof v === "number") {
    // Angka seri tanggal Excel (mis. 44835 = 01-10-2022)
    if (kind !== "text" && v >= 10_000 && v < 80_000) return fmt(serialToDate(v), kind);
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  }

  const s = String(v).replace(/\s+/g, " ").trim();
  // Isi kosong / tanda strip / karakter nyasar dianggap kosong
  if (!s || /^[^a-z0-9]$/i.test(s)) return null;
  return s;
}

const isSoldNote = (s: string | null | undefined) => !!s && /sold|dijual|dibongkar/i.test(s);
const joinNotes = (...notes: (string | null | undefined)[]) => notes.filter(Boolean).join("; ") || null;

// ===== Pembacaan sheet inventaris (Stamping, Spot Welding, P2, Utility) =====

// Label header -> field asset
const HEADER_MAP: [RegExp, TextKey | "kode" | "no"][] = [
  [/^no\.?$/, "no"],
  [/^kode/, "kode"],
  [/^description/, "description"],
  [/^(kapasitas|kap)$/, "kapasitas"],
  [/^model$/, "model"],
  [/^tahun/, "tahunPembuatan"],
  [/^nomor ?seri/, "nomorSeri"],
  [/^power$/, "power"],
  [/^tgl/, "tglInstal"],
  [/^keterangan/, "keterangan"],
  [/^capacity/, "capacityKn"],
  [/^slide stroke/, "slideStroke"],
  [/^stroke/, "strokePerMinute"],
  [/^die height/, "dieHeight"],
  [/^slide adjus/, "slideAdjustment"],
  [/^slide area/, "slideArea"],
  [/^bolster/, "bolsterArea"],
  [/^main motor/, "mainMotor"],
  [/^req air/, "reqAirPressure"],
  [/^max upper/, "maxUpperDieWeight"],
  [/^power source/, "powerSource"],
  [/^braking/, "brakingTime"],
];

const KIND: Partial<Record<TextKey, Kind>> = { tahunPembuatan: "year", tglInstal: "date" };

function findHeader(ws: ExcelJS.Worksheet) {
  for (let r = 1; r <= 12; r++) {
    const map = new Map<string, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const label = String(rawValue(cell) ?? "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!label) return;
      const hit = HEADER_MAP.find(([re]) => re.test(label));
      if (hit && !map.has(hit[1])) map.set(hit[1], col);
    });
    if (map.has("kode")) return { row: r, map };
  }
  throw new Error(`Sheet "${ws.name}": baris header (kolom "Kode") tidak ditemukan`);
}

const SUB_ROW = /^(uncoiler|box changer|conveyor output)$/i;

type StampingUncoiler = { parent: string; row: AssetRow };

function parseInventarisSheet(ws: ExcelJS.Worksheet, opts: { stamping?: boolean; sections?: boolean }) {
  const { row: headerRow, map } = findHeader(ws);
  const rows: AssetRow[] = [];
  const uncoilers: StampingUncoiler[] = [];
  const col = (k: string) => map.get(k);
  const ketCol = col("keterangan");
  const dieCol = col("dieHeight");

  let lane: string | null = null;
  let parent: string | null = null;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const get = (c: number | undefined, kind: Kind = "text") => (c ? fmt(rawValue(ws.getCell(r, c)), kind) : null);

    // Judul seksi di P2 ("GEOMET LINE :", "RINGGU MAKI :") jadi lane untuk baris di bawahnya
    if (opts.sections) {
      const first = rawValue(ws.getCell(r, 1));
      if (typeof first === "string" && first.includes(":")) {
        lane = first.split(":")[0].replace(/\bLINE\b/i, "").replace(/\s+/g, " ").trim().toUpperCase();
        continue;
      }
    }

    const kodeRaw = get(col("kode"));
    if (!kodeRaw) continue;

    const data: Partial<Record<TextKey, string | null>> = {};
    for (const [k, c] of map) {
      if (k === "kode" || k === "no") continue;
      data[k as TextKey] = get(c, KIND[k as TextKey] ?? "text");
    }

    // Die Height di Stamping punya kolom min & max
    if (dieCol) {
      const max = get(dieCol + 1);
      if (max && data.dieHeight) data.dieHeight = `${data.dieHeight} - ${max}`;
      else if (max) data.dieHeight = max;
    }

    // Kolom tanpa judul setelah KETERANGAN berisi catatan tambahan (sold, dibongkar, mesin critical, dll.)
    const extra: string[] = [];
    if (ketCol && !opts.stamping) {
      for (const c of [ketCol + 1, ketCol + 2]) {
        const v = rawValue(ws.getCell(r, c));
        const s = typeof v === "string" ? fmt(v) : null;
        if (s) extra.push(s);
      }
    }
    // "Planing to Sell" nyasar di kolom Power Source
    if (data.powerSource && !/\d/.test(data.powerSource)) {
      extra.push(data.powerSource);
      data.powerSource = null;
    }

    // Angka nyasar di kolom KETERANGAN (mis. "26") bukan catatan
    if (data.keterangan && /^\d+(\.\d+)?$/.test(data.keterangan)) data.keterangan = null;
    const notes = joinNotes(data.keterangan, ...extra);
    const row: AssetRow = {
      sheet: ws.name,
      baris: r,
      kode: kodeRaw,
      status: isSoldNote(notes) ? "inactive" : "active",
      ...data,
      keterangan: notes,
      lane: data.lane ?? lane,
    };

    if (opts.stamping) {
      const sub = SUB_ROW.exec(kodeRaw);
      if (!sub) {
        parent = kodeRaw;
      } else if (parent) {
        if (/uncoiler/i.test(sub[1])) {
          uncoilers.push({ parent, row });
          continue;
        }
        row.kode = `${parent} ${sub[1].toUpperCase()}`;
        row.lane = parent;
      }
    }

    rows.push(row);
  }
  return { rows, uncoilers };
}

// ===== Sheet GEN MAINT UNCOILER =====

// "PG 10" -> "PG.10"
const cleanMc = (s: string) => s.trim().replace(/^([A-Z]+)\s+(\d+)$/i, "$1.$2");
const mcKey = (s: string) => norm(s.split("=>").pop() ?? s);

function parseUncoilerSheet(ws: ExcelJS.Worksheet) {
  let headerRow = 0;
  for (let r = 1; r <= 12 && !headerRow; r++) {
    if (/^no ?mc$/i.test(String(rawValue(ws.getCell(r, 1)) ?? "").trim())) headerRow = r;
  }
  if (!headerRow) throw new Error(`Sheet "${ws.name}": header "NO MC" tidak ditemukan`);

  const rows: AssetRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const get = (c: number, kind: Kind = "text") => fmt(rawValue(ws.getCell(r, c)), kind);
    const mc = get(1);
    if (!mc) continue;
    if (/^note/i.test(mc)) break;
    if (!get(2) && !get(3)) continue; // baris judul bulan / minggu

    const width = get(6);
    const thick = get(7);
    const speed = get(8);
    const top = get(9);
    const mesin = cleanMc(mc);
    rows.push({
      sheet: ws.name,
      baris: r,
      kode: `UNC ${mesin}`,
      status: "active",
      description: get(2),
      model: get(3),
      tahunPembuatan: get(4, "year"),
      nomorSeri: get(5),
      power: get(10),
      lane: mesin,
      kapasitas: joinNotes(width && `W ${width} mm`, thick && `T ${thick} mm`)?.replace("; ", " / ") ?? null,
      keterangan: joinNotes(speed && `Line speed max ${speed} m/min`, top && `Top speed ${top} m/s`),
    });
  }
  return rows;
}

// Uncoiler yang hanya tercatat di sheet Stamping (tidak ada di GEN MAINT UNCOILER)
function extraUncoilers(fromStamping: StampingUncoiler[], genRows: AssetRow[]) {
  const mcs = new Set(genRows.map((r) => mcKey(r.lane ?? "")));
  // Penamaan beda di dua sheet untuk press yang sama
  if (mcs.has("prpdd")) mcs.add("pddpr01");
  const serials = new Set(genRows.map((r) => r.nomorSeri && norm(r.nomorSeri)).filter(Boolean));

  return fromStamping
    .filter(({ parent, row }) => !mcs.has(mcKey(parent)) && !(row.nomorSeri && serials.has(norm(row.nomorSeri))))
    .map(({ parent, row }) => ({
      ...row,
      kode: `UNC ${parent}`,
      lane: parent,
      kapasitas: null,
      keterangan: joinNotes(row.keterangan, "Dari sheet Stamping"),
    }));
}

// ===== Rapikan: panjang kolom & kode kembar =====

const MAX: Partial<Record<TextKey | "kode", number>> = {
  kode: 50, lane: 100, kapasitas: 100, model: 100, tahunPembuatan: 10, nomorSeri: 100, power: 100, tglInstal: 100,
  capacityKn: 100, slideStroke: 100, strokePerMinute: 100, dieHeight: 100, slideAdjustment: 100, slideArea: 100,
  bolsterArea: 100, mainMotor: 100, reqAirPressure: 100, maxUpperDieWeight: 100, powerSource: 100, brakingTime: 100,
};

function finalize(all: { cat: CategoryDef; row: AssetRow }[]) {
  const notes: string[] = [];
  const used = new Set<string>();

  for (const { cat, row } of all) {
    // Tahun pembuatan maks 10 karakter: ambil tahunnya, teks asli disimpan di keterangan
    if (row.tahunPembuatan && row.tahunPembuatan.length > 10) {
      const original = row.tahunPembuatan;
      row.tahunPembuatan = original.match(/\d{4}/g)?.pop() ?? original.slice(0, 10);
      row.keterangan = joinNotes(row.keterangan, `Tahun pembuatan: ${original}`);
    }
    for (const [k, max] of Object.entries(MAX)) {
      const v = row[k as TextKey];
      if (k !== "kode" && v && v.length > max!) {
        row[k as TextKey] = v.slice(0, max);
        notes.push(`[${cat.name}] ${row.kode}: ${k} dipotong jadi ${max} karakter`);
      }
    }

    const original = row.kode;
    let kode = original.slice(0, 50);
    if (used.has(kodeKey(kode))) {
      const sold = row.status === "inactive" && /sold|dijual/i.test(row.keterangan ?? "");
      const base = kode.slice(0, 42);
      kode = sold && !used.has(kodeKey(`${base} (SOLD)`)) ? `${base} (SOLD)` : base;
      for (let n = 2; used.has(kodeKey(kode)); n++) kode = `${base} (${n})`;
      notes.push(`[${cat.name}] baris ${row.baris} sheet "${row.sheet}": kode "${original}" kembar -> "${kode}"`);
    }
    row.kode = kode;
    used.add(kodeKey(kode));
  }
  return notes;
}

// ===== Main =====

type Prisma = (typeof import("../src/lib/prisma"))["prisma"];
let prismaRef: Prisma | null = null;

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const noDb = args.includes("--no-db");
  if (!file) {
    console.error('Pemakaian: npx tsx scripts/import-inventaris-mesin.ts "<file.xlsx>" [--apply] [--no-db]');
    process.exit(1);
  }
  if (apply && noDb) throw new Error("--apply tidak bisa dipakai bersama --no-db");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const sheetOf = (cat: CategoryDef) => wb.worksheets.find((ws) => cat.sheet.test(ws.name));
  const byCat = new Map<string, AssetRow[]>();
  let stampingUncoilers: StampingUncoiler[] = [];

  for (const cat of CATEGORIES) {
    const ws = sheetOf(cat);
    if (!ws) {
      console.warn(`! Sheet untuk kategori "${cat.name}" tidak ditemukan, dilewati`);
      continue;
    }
    if (cat.key === "uncoiler") {
      byCat.set(cat.key, parseUncoilerSheet(ws));
    } else {
      const { rows, uncoilers } = parseInventarisSheet(ws, {
        stamping: cat.key === "stamping",
        sections: cat.key === "p2",
      });
      byCat.set(cat.key, rows);
      if (cat.key === "stamping") stampingUncoilers = uncoilers;
    }
  }
  if (byCat.has("uncoiler")) {
    byCat.get("uncoiler")!.push(...extraUncoilers(stampingUncoilers, byCat.get("uncoiler")!));
  }

  const all = CATEGORIES.flatMap((cat) => (byCat.get(cat.key) ?? []).map((row) => ({ cat, row })));
  const notes = finalize(all);

  // ===== Cek ke database =====
  type Plan = { cat: CategoryDef; row: AssetRow; action: "baru" | "update" | "lewati"; info?: string; existingId?: number };
  const plans: Plan[] = all.map((x) => ({ ...x, action: "baru" }));
  const categoryIds = new Map<string, number | null>();

  let prisma: Prisma | null = null;
  if (!noDb) {
    prisma = prismaRef = (await import("../src/lib/prisma")).prisma;
    const kategori = await prisma.kategoriAset.findMany({ select: { id: true, name: true } });
    for (const cat of CATEGORIES) {
      const found = kategori.find((k) => cat.aliases.includes(norm(k.name)) || norm(k.name) === norm(cat.name));
      categoryIds.set(cat.key, found?.id ?? null);
      console.log(
        found ? `Kategori "${cat.name}" -> pakai kategori yang ada: "${found.name}" (id ${found.id})`
              : `Kategori "${cat.name}" -> belum ada, akan DIBUAT`,
      );
    }

    const existing = await prisma.asset.findMany({ select: { id: true, kode: true, categoryId: true } });
    const byKode = new Map(existing.map((a) => [kodeKey(a.kode), a]));
    for (const p of plans) {
      const hit = byKode.get(kodeKey(p.row.kode));
      if (!hit) continue;
      if (hit.categoryId === categoryIds.get(p.cat.key)) {
        p.action = "update";
        p.existingId = hit.id;
      } else {
        p.action = "lewati";
        p.info = `kode sudah dipakai asset di kategori lain (id kategori ${hit.categoryId})`;
      }
    }
  }

  // ===== File preview =====
  const out = new ExcelJS.Workbook();
  const fields: (TextKey | "kode" | "status")[] = [
    "kode", "status", "description", "lane", "kapasitas", "model", "tahunPembuatan", "nomorSeri", "power",
    "tglInstal", "keterangan", "capacityKn", "slideStroke", "strokePerMinute", "dieHeight", "slideAdjustment",
    "slideArea", "bolsterArea", "mainMotor", "reqAirPressure", "maxUpperDieWeight", "powerSource", "brakingTime",
  ];
  for (const cat of CATEGORIES) {
    const list = plans.filter((p) => p.cat.key === cat.key);
    if (!list.length) continue;
    const ws = out.addWorksheet(cat.name, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
    ws.columns = [
      { header: "AKSI", key: "aksi", width: 9 },
      ...fields.map((f) => ({ header: f, key: f, width: f === "keterangan" || f === "description" ? 36 : 16 })),
      { header: "BARIS ASAL", key: "baris", width: 11 },
      { header: "INFO", key: "info", width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of list) ws.addRow({ aksi: noDb ? "-" : p.action, ...p.row, baris: p.row.baris, info: p.info });
  }
  if (notes.length) {
    const ws = out.addWorksheet("Catatan");
    ws.columns = [{ header: "Catatan pembersihan data", width: 120 }];
    notes.forEach((n) => ws.addRow([n]));
  }
  const previewPath = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.preview.xlsx`);
  await out.xlsx.writeFile(previewPath);

  // ===== Ringkasan =====
  console.log("\nRingkasan per kategori:");
  for (const cat of CATEGORIES) {
    const list = plans.filter((p) => p.cat.key === cat.key);
    if (!list.length) continue;
    const c = (a: Plan["action"]) => list.filter((p) => p.action === a).length;
    const inactive = list.filter((p) => p.row.status === "inactive").length;
    console.log(
      `  ${cat.name.padEnd(18)} ${String(list.length).padStart(4)} baris` +
        (noDb ? "" : ` | baru ${c("baru")}, update ${c("update")}, lewati ${c("lewati")}`) +
        ` | inactive ${inactive}`,
    );
  }
  if (notes.length) console.log(`\n${notes.length} catatan pembersihan data (lihat sheet "Catatan" di file preview)`);
  for (const p of plans.filter((p) => p.action === "lewati")) {
    console.log(`  LEWATI [${p.cat.name}] ${p.row.kode}: ${p.info}`);
  }
  console.log(`\nFile preview: ${previewPath}`);

  if (!apply || !prisma) {
    console.log("\nBelum ada yang disimpan. Cek file preview, lalu jalankan ulang dengan --apply.");
    return;
  }

  // ===== Simpan =====
  const db = prisma;
  const result = await db.$transaction(
    async (tx) => {
      let created = 0;
      let updated = 0;
      for (const cat of CATEGORIES) {
        const list = plans.filter((p) => p.cat.key === cat.key && p.action !== "lewati");
        if (!list.length) continue;
        let categoryId = categoryIds.get(cat.key);
        if (!categoryId) categoryId = (await tx.kategoriAset.create({ data: { name: cat.name } })).id;

        const toData = (row: AssetRow) => {
          const { sheet: _s, baris: _b, ...data } = row;
          return { ...data, categoryId: categoryId! };
        };
        const newRows = list.filter((p) => p.action === "baru").map((p) => toData(p.row));
        if (newRows.length) await tx.asset.createMany({ data: newRows });
        for (const p of list.filter((p) => p.action === "update")) {
          await tx.asset.update({ where: { id: p.existingId! }, data: toData(p.row) });
        }
        created += newRows.length;
        updated += list.length - newRows.length;
      }
      return { created, updated };
    },
    { timeout: 120_000 },
  );
  console.log(`\nSELESAI: ${result.created} asset baru, ${result.updated} asset diperbarui.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prismaRef?.$disconnect());
