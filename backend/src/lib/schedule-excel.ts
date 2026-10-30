import ExcelJS from "exceljs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { cellText } from "./checksheet-excel";

// ===== Import jadwal preventive dari file Excel yang sudah dipakai user =====
// Bentuk file (Stamping, Spot Welding, Geomet, Utility):
// - Baris header bulan (JANUARI..DESEMBER) dan di bawahnya baris minggu W1..W4 (48 kolom)
// - Kolom kiri: NO, kode/nama mesin, deskripsi
// - Jadwal ditandai SHAPE yang ditempel di atas sel (bukan isi sel):
//     bulatan  = aktivitas periodik
//     segitiga = aktivitas tahunan
//   sebagian shape dibungkus group. Ada juga yang ditulis sebagai teks "∆"/"O" di sel minggu.
// - Baris yang hanya berisi teks di kolom NO (mis. "GEOMET", "COMPRESSOR") = sub-grup
// - Tabel berakhir di baris "Paraf..." / "REMARK" / "TOTAL"

export type ScheduleType = "periodic" | "yearly";

export type ParsedSchedule = { bulan: number; minggu: number; tipe: ScheduleType };

export type ParsedPlanRow = {
  baris: number;
  no: string;
  grup: string | null;
  nama: string;
  deskripsi: string | null;
  schedules: ParsedSchedule[];
};

export type ParsedScheduleFile = {
  sheet: string;
  tahun: number | null;
  rows: ParsedPlanRow[];
  warnings: string[];
};

const EMU_PER_PX = 9525;
const EMU_PER_PT = 12700;
const DEFAULT_COL_WIDTH = 8.43; // satuan karakter Excel
const DEFAULT_ROW_HEIGHT = 15; // satuan point

const SHAPE_TYPE: Record<string, ScheduleType> = {
  ellipse: "periodic",
  flowChartConnector: "periodic",
  triangle: "yearly",
};
const TEXT_MARK: Record<string, ScheduleType> = {
  O: "periodic",
  "○": "periodic",
  "●": "periodic",
  "∆": "yearly",
  "Δ": "yearly",
  "△": "yearly",
  "▲": "yearly",
};

const END_OF_TABLE = /^(paraf|remark|total|catatan|note)/i;
const LABEL_HEADER = /^(kode\s*mesin|no\.?\s*mc|nama\s*mesin|kode)$/i;
const NO_HEADER = /^(no\.?|sl\s*no)$/i;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// ----- Ukuran sel dalam EMU (satuan posisi shape) -----

function columnWidthEmu(ws: ExcelJS.Worksheet, col: number) {
  const column = ws.getColumn(col);
  if (column.hidden) return 0;
  const chars = column.width ?? DEFAULT_COL_WIDTH;
  // Rumus lebar kolom Excel (font default Calibri 11): px = karakter * 7 + 5
  return Math.round(chars * 7 + 5) * EMU_PER_PX;
}

function rowHeightEmu(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  if (r.hidden) return 0;
  return (r.height ?? ws.properties.defaultRowHeight ?? DEFAULT_ROW_HEIGHT) * EMU_PER_PT;
}

// Titik (sel + offset EMU) -> geser sejauh `delta` EMU, kembalikan sel tujuan (1-based)
function walk(start: number, offset: number, delta: number, size: (i: number) => number) {
  let index = start;
  let pos = offset + delta;
  while (pos < 0 && index > 1) {
    index--;
    pos += size(index);
  }
  // Kolom/baris tersembunyi (ukuran 0) otomatis terlewati
  while (index < start + 5000) {
    const s = size(index);
    if (pos < s) return index;
    pos -= s;
    index++;
  }
  return index;
}

// Jarak EMU dari awal sel `a` (+offA) ke awal sel `b` (+offB)
function distance(a: number, offA: number, b: number, offB: number, size: (i: number) => number) {
  let d = offB - offA;
  for (let i = a; i < b; i++) d += size(i);
  return d;
}

// ----- Baca shape dari drawing XML -----

type Anchor = { col: number; colOff: number; row: number; rowOff: number }; // 1-based col/row
// picture = berasal dari gambar bulatan (bukan shape), dilaporkan di warning
type FoundShape = { prst: string; col: number; row: number; picture?: boolean };

type Xfrm = { x: number; y: number; cx: number; cy: number; chx?: number; chy?: number; chcx?: number; chcy?: number };

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function readXfrm(node: any): Xfrm | null {
  const x = node?.["a:xfrm"];
  if (!x) return null;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    x: n(x["a:off"]?.["@_x"]),
    y: n(x["a:off"]?.["@_y"]),
    cx: n(x["a:ext"]?.["@_cx"]),
    cy: n(x["a:ext"]?.["@_cy"]),
    chx: x["a:chOff"] ? n(x["a:chOff"]["@_x"]) : undefined,
    chy: x["a:chOff"] ? n(x["a:chOff"]["@_y"]) : undefined,
    chcx: x["a:chExt"] ? n(x["a:chExt"]["@_cx"]) : undefined,
    chcy: x["a:chExt"] ? n(x["a:chExt"]["@_cy"]) : undefined,
  };
}

function toAnchor(node: any): Anchor {
  return {
    col: Number(node["xdr:col"]) + 1,
    colOff: Number(node["xdr:colOff"]),
    row: Number(node["xdr:row"]) + 1,
    rowOff: Number(node["xdr:rowOff"]),
  };
}

// Kumpulkan shape dalam satu anchor. Posisi shape di dalam group dihitung proporsional terhadap
// kotak anchor group, jadi tidak bergantung pada posisi absolut yang dihitung Excel.
function collectShapes(ws: ExcelJS.Worksheet, anchorNode: any, out: FoundShape[], ignored: { count: number }) {
  const from = toAnchor(anchorNode["xdr:from"]);
  const colSize = (i: number) => columnWidthEmu(ws, i);
  const rowSize = (i: number) => rowHeightEmu(ws, i);

  // Lebar & tinggi kotak anchor dalam EMU
  let width: number;
  let height: number;
  if (anchorNode["xdr:to"]) {
    const to = toAnchor(anchorNode["xdr:to"]);
    width = distance(from.col, from.colOff, to.col, to.colOff, colSize);
    height = distance(from.row, from.rowOff, to.row, to.rowOff, rowSize);
  } else {
    width = Number(anchorNode["xdr:ext"]?.["@_cx"] ?? 0);
    height = Number(anchorNode["xdr:ext"]?.["@_cy"] ?? 0);
  }

  // Titik relatif (0..1) di dalam kotak anchor -> sel
  const place = (fx: number, fy: number, prst: string) => {
    out.push({
      prst,
      col: walk(from.col, from.colOff, fx * width, colSize),
      row: walk(from.row, from.rowOff, fy * height, rowSize),
    });
  };

  const visit = (node: any, kind: string, frame: { x: number; y: number; cx: number; cy: number } | null) => {
    if (kind === "xdr:sp") {
      const prst = node["xdr:spPr"]?.["a:prstGeom"]?.["@_prst"] ?? "";
      if (!SHAPE_TYPE[prst]) {
        ignored.count++;
        return;
      }
      if (!frame) {
        // Shape yang seluruhnya di dalam satu sel: pakai sel itu apa adanya (tanpa estimasi ukuran)
        const to = anchorNode["xdr:to"] ? toAnchor(anchorNode["xdr:to"]) : null;
        if (to && to.col === from.col && to.row === from.row) {
          out.push({ prst, col: from.col, row: from.row });
          return;
        }
        return place(0.5, 0.5, prst);
      }
      const xf = readXfrm(node["xdr:spPr"]);
      if (!xf || frame.cx === 0 || frame.cy === 0) return place(0.5, 0.5, prst);
      // Titik tengah shape dalam koordinat anak group -> proporsi kotak group
      place((xf.x + xf.cx / 2 - frame.x) / frame.cx, (xf.y + xf.cy / 2 - frame.y) / frame.cy, prst);
      return;
    }

    if (kind === "xdr:grpSp") {
      const xf = readXfrm(node["xdr:grpSpPr"]);
      // Anak group memakai ruang koordinat chOff/chExt yang dipetakan ke kotak anchor.
      // Group bersarang (jarang) cukup didekati dengan ruang koordinat group terluar.
      const childFrame =
        frame ?? (xf?.chcx && xf.chcy ? { x: xf.chx!, y: xf.chy!, cx: xf.chcx, cy: xf.chcy } : null);
      for (const key of ["xdr:sp", "xdr:grpSp", "xdr:pic", "xdr:cxnSp", "xdr:graphicFrame"]) {
        for (const child of asArray(node[key])) visit(child, key, childFrame);
      }
      return;
    }

    if (kind === "xdr:pic") {
      // Sebagian jadwal berupa GAMBAR bulatan yang ditumpuk vertikal (hasil copy-paste as picture).
      // Gambar selebar satu kolom minggu dibaca sebagai satu bulatan di setiap baris yang ditutupinya.
      let [fx0, fy0, fx1, fy1] = [0, 0, 1, 1];
      if (frame) {
        const xf = readXfrm(node["xdr:spPr"]);
        if (!xf || frame.cx === 0 || frame.cy === 0) return void ignored.count++;
        fx0 = (xf.x - frame.x) / frame.cx;
        fx1 = (xf.x + xf.cx - frame.x) / frame.cx;
        fy0 = (xf.y - frame.y) / frame.cy;
        fy1 = (xf.y + xf.cy - frame.y) / frame.cy;
      }
      const col = walk(from.col, from.colOff, fx0 * width + 1, colSize);
      if (walk(from.col, from.colOff, fx1 * width - 1, colSize) !== col) return void ignored.count++;

      const top = fy0 * height;
      const bottom = fy1 * height;
      const lastRow = walk(from.row, from.rowOff, bottom, rowSize);
      let found = 0;
      for (let r = walk(from.row, from.rowOff, top, rowSize); r <= lastRow; r++) {
        if (rowSize(r) === 0) continue;
        const middle = distance(from.row, from.rowOff, r, 0, rowSize) + rowSize(r) / 2;
        if (middle >= top && middle <= bottom) {
          out.push({ prst: "ellipse", col, row: r, picture: true });
          found++;
        }
      }
      if (found === 0) ignored.count++;
      return;
    }

    // Garis, chart: bukan penanda jadwal
    ignored.count++;
  };

  for (const key of ["xdr:sp", "xdr:grpSp", "xdr:pic", "xdr:cxnSp", "xdr:graphicFrame"]) {
    for (const child of asArray(anchorNode[key])) visit(child, key, null);
  }
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// Path file xml drawing milik sebuah sheet (lewat relasi workbook -> sheet -> drawing)
async function drawingPathOf(zip: JSZip, sheetName: string) {
  const workbook = xml.parse((await zip.file("xl/workbook.xml")?.async("string")) ?? "");
  const sheets = asArray<any>(workbook?.workbook?.sheets?.sheet);
  const rid = sheets.find((s) => s["@_name"] === sheetName)?.["@_r:id"];
  if (!rid) return null;

  const wbRels = xml.parse((await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "");
  const target = asArray<any>(wbRels?.Relationships?.Relationship).find((r) => r["@_Id"] === rid)?.["@_Target"];
  if (!target) return null;
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;

  const relPath = sheetPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const sheetRels = xml.parse((await zip.file(relPath)?.async("string")) ?? "");
  const drawing = asArray<any>(sheetRels?.Relationships?.Relationship).find((r) =>
    String(r["@_Type"]).endsWith("/drawing"),
  )?.["@_Target"];
  if (!drawing) return null;

  // Target relatif terhadap folder sheet, mis. "../drawings/drawing1.xml"
  const parts = sheetPath.split("/").slice(0, -1);
  for (const seg of String(drawing).split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

async function readShapes(zip: JSZip, ws: ExcelJS.Worksheet) {
  const shapes: FoundShape[] = [];
  const ignored = { count: 0 };
  const path = await drawingPathOf(zip, ws.name);
  const content = path ? await zip.file(path)?.async("string") : undefined;
  if (!content) return { shapes, ignored: 0 };

  const root = xml.parse(content)?.["xdr:wsDr"] ?? {};
  const anchors = [
    ...asArray<any>(root["xdr:twoCellAnchor"]),
    ...asArray<any>(root["xdr:oneCellAnchor"]),
    // Shape versi baru dibungkus AlternateContent; pakai versi Choice
    ...asArray<any>(root["mc:AlternateContent"]).flatMap((alt) => [
      ...asArray<any>(alt?.["mc:Choice"]?.["xdr:twoCellAnchor"]),
      ...asArray<any>(alt?.["mc:Choice"]?.["xdr:oneCellAnchor"]),
    ]),
  ];
  for (const anchor of anchors) collectShapes(ws, anchor, shapes, ignored);
  return { shapes, ignored: ignored.count };
}

// ----- Baca tabel -----

function findWeekColumns(ws: ExcelJS.Worksheet, rowCount: number, columnCount: number) {
  for (let r = 1; r <= Math.min(rowCount, 20); r++) {
    const cols: number[] = [];
    for (let c = 1; c <= columnCount; c++) {
      if (/^W[1-4]$/i.test(cellText(ws.getCell(r, c)))) cols.push(c);
    }
    if (cols.length >= 48) {
      // Kolom ke-n = bulan floor(n/4)+1, minggu n%4+1
      const map = new Map<number, { bulan: number; minggu: number }>();
      cols.slice(0, 48).forEach((c, i) => map.set(c, { bulan: Math.floor(i / 4) + 1, minggu: (i % 4) + 1 }));
      return { row: r, map, first: cols[0] };
    }
  }
  return null;
}

function findYear(ws: ExcelJS.Worksheet, upToRow: number, columnCount: number) {
  for (let r = 1; r <= upToRow; r++) {
    for (let c = 1; c <= columnCount; c++) {
      const m = cellText(ws.getCell(r, c)).match(/TAHUN\s*:?\s*(\d{4})/i);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function parseSheet(ws: ExcelJS.Worksheet, shapes: FoundShape[], ignoredShapes: number): ParsedScheduleFile | null {
  // rowCount/columnCount exceljs dihitung ulang tiap dipanggil, jadi simpan sekali
  const rowCount = ws.rowCount;
  const columnCount = Math.min(ws.columnCount, 200);

  const weeks = findWeekColumns(ws, rowCount, columnCount);
  if (!weeks) return null;

  const warnings: string[] = [];
  const tahun = findYear(ws, weeks.row, columnCount);

  // Kolom kiri sebelum kolom minggu: NO, kode/nama mesin, deskripsi
  let noCol = 1;
  let labelCol: number | null = null;
  const descCols: number[] = [];
  for (let r = 1; r <= weeks.row; r++) {
    for (let c = 1; c < weeks.first; c++) {
      const cell = ws.getCell(r, c);
      if (cell.isMerged && cell.master !== cell) continue;
      const text = norm(cellText(cell));
      if (!text) continue;
      if (NO_HEADER.test(text)) noCol = c;
      else if (LABEL_HEADER.test(text)) labelCol ??= c;
      else if (r >= weeks.row - 3 && !/^tahun/i.test(text) && !descCols.includes(c)) descCols.push(c);
    }
  }
  if (labelCol === null) labelCol = noCol + 1;
  const deskripsiCols = descCols.filter((c) => c !== noCol && c !== labelCol).sort((a, b) => a - b);

  // Baris data
  const rows: ParsedPlanRow[] = [];
  const rowIndex = new Map<number, ParsedPlanRow>();
  let grup: string | null = null;
  let hiddenRows = 0;

  for (let r = weeks.row + 1; r <= rowCount; r++) {
    const noText = norm(cellText(ws.getCell(r, noCol)));
    if (END_OF_TABLE.test(noText)) break;

    const labelCell = ws.getCell(r, labelCol);
    const label = norm(cellText(labelCell));
    // Sel nama yang ikut merge dari kolom lain (mis. judul grup selebar tabel) bukan nama mesin
    const mergedFromOtherColumn = labelCell.isMerged && Number(labelCell.master.col) !== labelCol;

    if (!label || mergedFromOtherColumn) {
      // Teks di kolom NO tanpa nama mesin = judul sub-grup
      const title = noText || label;
      if (title && !/^\d+$/.test(title)) grup = title.replace(/\s*:\s*$/, "");
      continue;
    }

    // Baris yang disembunyikan di Excel dianggap tidak aktif
    if (ws.getRow(r).hidden) {
      hiddenRows++;
      continue;
    }

    const deskripsi = deskripsiCols.map((c) => norm(cellText(ws.getCell(r, c)))).filter(Boolean).join(" / ");
    const row: ParsedPlanRow = { baris: r, no: noText, grup, nama: label, deskripsi: deskripsi || null, schedules: [] };
    rows.push(row);
    rowIndex.set(r, row);

    // Penanda jadwal berupa teks di sel minggu
    for (const [c, week] of weeks.map) {
      const mark = TEXT_MARK[cellText(ws.getCell(r, c)).toUpperCase()];
      if (mark) row.schedules.push({ ...week, tipe: mark });
    }
  }

  // Penanda jadwal berupa shape
  let outside = 0;
  let fromPicture = 0;
  for (const shape of shapes) {
    const row = rowIndex.get(shape.row);
    const week = weeks.map.get(shape.col);
    if (!row || !week) {
      outside++;
      continue;
    }
    row.schedules.push({ ...week, tipe: SHAPE_TYPE[shape.prst] });
    if (shape.picture) fromPicture++;
  }

  // Shape dobel di sel yang sama dihitung sekali; urutkan per bulan & minggu
  for (const row of rows) {
    const seen = new Set<string>();
    row.schedules = row.schedules
      .filter((s) => {
        const key = `${s.bulan}-${s.minggu}-${s.tipe}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.bulan - b.bulan || a.minggu - b.minggu);
  }

  if (tahun === null) warnings.push('Tahun tidak ditemukan di file (mis. "TAHUN : 2026")');
  if (hiddenRows > 0) warnings.push(`${hiddenRows} baris yang disembunyikan (hidden) di Excel dilewati`);
  if (outside > 0) {
    warnings.push(`${outside} penanda di luar tabel jadwal diabaikan (mis. legenda, catatan, atau mesin di luar tabel)`);
  }
  if (fromPicture > 0) {
    warnings.push(`${fromPicture} jadwal dibaca dari GAMBAR bulatan (bukan shape), mohon dicek di preview`);
  }
  if (ignoredShapes > 0) warnings.push(`${ignoredShapes} gambar/shape lain (bukan bulatan/segitiga) diabaikan`);

  return { sheet: ws.name, tahun, rows, warnings };
}

export async function parseScheduleWorkbook(buffer: Buffer): Promise<ParsedScheduleFile | { error: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const zip = await JSZip.loadAsync(buffer);

  for (const ws of wb.worksheets) {
    if (ws.state !== "visible") continue;
    const { shapes, ignored } = await readShapes(zip, ws);
    const parsed = parseSheet(ws, shapes, ignored);
    if (parsed) return parsed;
  }

  return { error: "Tabel jadwal tidak ditemukan. Pastikan ada baris minggu W1–W4 untuk 12 bulan" };
}
