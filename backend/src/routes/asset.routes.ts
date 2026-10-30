import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { buildAssetTemplate, parseAssetWorkbook, type ParsedAssetRow } from "../lib/asset-excel";

const router = Router();

// Semua route wajib login; tambah/edit/hapus khusus admin
router.use(requireAuth);

// Kolom opsional: string kosong disimpan sebagai null
function optionalText(max?: number) {
  const base = z.string().trim();
  return (max ? base.max(max, `Maksimal ${max} karakter`) : base)
    .nullish()
    .transform((value) => value || null);
}

const schema = z.object({
  categoryId: z.coerce
    .number({ error: "Kategori wajib dipilih" })
    .int()
    .positive("Kategori wajib dipilih"),
  status: z.enum(["active", "inactive"], { error: "Status tidak valid" }),
  kode: z
    .string({ error: "Kode wajib diisi" })
    .trim()
    .min(1, "Kode wajib diisi")
    .max(50, "Kode maksimal 50 karakter"),
  description: optionalText(),
  lane: optionalText(100),
  kapasitas: optionalText(100),
  model: optionalText(100),
  tahunPembuatan: optionalText(10),
  nomorSeri: optionalText(100),
  power: optionalText(100),
  tglInstal: optionalText(100),
  keterangan: optionalText(),
  capacityKn: optionalText(100),
  slideStroke: optionalText(100),
  strokePerMinute: optionalText(100),
  dieHeight: optionalText(100),
  slideAdjustment: optionalText(100),
  slideArea: optionalText(100),
  bolsterArea: optionalText(100),
  mainMotor: optionalText(100),
  reqAirPressure: optionalText(100),
  maxUpperDieWeight: optionalText(100),
  powerSource: optionalText(100),
  brakingTime: optionalText(100),
  // Checksheet preventive mesin ini; kosong = belum dipilih
  checksheetId: z.coerce
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? null),
});

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// Ikutkan nama kategori & checksheet di setiap respons
const include = {
  category: { select: { id: true, name: true } },
  checksheet: { select: { id: true, name: true } },
} as const;

// Checksheet harus milik kategori yang sama dengan asset
async function invalidChecksheet(checksheetId: number | null, categoryId: number) {
  if (checksheetId === null) return false;
  const checksheet = await prisma.checksheet.findUnique({ where: { id: checksheetId }, select: { categoryId: true } });
  return checksheet?.categoryId !== categoryId;
}

const checksheetError = {
  message: "Data tidak valid",
  errors: { checksheetId: ["Checksheet tidak ditemukan di kategori ini"] },
};

// Cek kode kembar (tidak membedakan huruf besar/kecil), kecuali data yang sedang diedit
function findDuplicateKode(kode: string, exceptId?: number) {
  return prisma.asset.findFirst({
    where: {
      kode: { equals: kode },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
}

const duplicateError = { message: "Data tidak valid", errors: { kode: ["Kode sudah dipakai"] } };
const categoryError = { message: "Data tidak valid", errors: { categoryId: ["Kategori tidak ditemukan"] } };

// GET /api/assets?categoryId=1&search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const categoryId = Number(req.query.categoryId) || undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = {
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { kode: { contains: search } },
            { model: { contains: search } },
            { nomorSeri: { contains: search } },
            { lane: { contains: search } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include,
      orderBy: { id: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.asset.count({ where }),
  ]);

  res.json({ data, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

// ===== Import Excel (per kategori: ?categoryId=) =====

// File Excel dikirim mentah (application/octet-stream), bukan multipart
const excelBody = express.raw({ type: "application/octet-stream", limit: "10mb" });
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function findCategory(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.kategoriAset.findUnique({ where: { id }, select: { id: true, name: true } });
}

type PreviewRow = ParsedAssetRow & { existingId: number | null };

// Baca file lalu cocokkan kode dengan asset yang sudah ada
async function buildPreview(body: unknown, categoryId: number) {
  if (!Buffer.isBuffer(body) || body.length === 0) return { error: "File Excel wajib diupload" } as const;

  let parsed: Awaited<ReturnType<typeof parseAssetWorkbook>>;
  try {
    parsed = await parseAssetWorkbook(body);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan formatnya .xlsx" } as const;
  }
  if ("error" in parsed) return { error: parsed.error } as const;

  const kodes = [...new Set(parsed.rows.map((r) => r.kode).filter(Boolean))];
  const existing = await prisma.asset.findMany({
    where: { kode: { in: kodes } },
    select: { id: true, kode: true, categoryId: true, category: { select: { name: true } } },
  });
  const existingByKode = new Map(existing.map((a) => [a.kode.toLowerCase(), a]));

  // Kode tidak boleh dobel di dalam file
  const firstRowOfKode = new Map<string, number>();
  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const errors = [...row.errors];
    const key = row.kode.toLowerCase();
    if (row.kode) {
      const first = firstRowOfKode.get(key);
      if (first) errors.push(`KODE sudah dipakai di baris ${first}`);
      else firstRowOfKode.set(key, row.baris);
    }

    // Kode unik di semua kategori: jangan diam-diam memindahkan asset dari kategori lain
    const found = existingByKode.get(key);
    if (found && found.categoryId !== categoryId) {
      errors.push(`KODE sudah dipakai di kategori "${found.category.name}"`);
    }

    return { ...row, errors, existingId: found && found.categoryId === categoryId ? found.id : null };
  });

  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return {
    rows,
    summary: {
      total: rows.length,
      baru: rows.filter((r) => r.errors.length === 0 && !r.existingId).length,
      update: rows.filter((r) => r.errors.length === 0 && r.existingId).length,
      invalid,
    },
    valid: invalid === 0,
  } as const;
}

// GET /api/assets/template?categoryId=1 — download template Excel
router.get("/template", async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan" });

  const filename = `template-asset-${category.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`;
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(await buildAssetTemplate(category.name));
});

// POST /api/assets/import/preview?categoryId=1 — cek isi file tanpa menyimpan
router.post("/import/preview", requireAdmin, excelBody, async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(422).json({ message: "Kategori tidak ditemukan" });

  const result = await buildPreview(req.body, category.id);
  if ("error" in result) return res.status(422).json({ message: result.error });
  res.json(result);
});

// POST /api/assets/import?categoryId=1 — simpan semua baris; ditolak kalau ada satu saja yang error
router.post("/import", requireAdmin, excelBody, async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(422).json({ message: "Kategori tidak ditemukan" });

  const result = await buildPreview(req.body, category.id);
  if ("error" in result) return res.status(422).json({ message: result.error });
  if (!result.valid) {
    return res.status(422).json({ message: "Masih ada data yang tidak valid, cek preview terlebih dahulu" });
  }

  const toData = ({ baris: _b, errors: _e, existingId: _x, ...data }: PreviewRow) => ({
    ...data,
    categoryId: category.id,
  });
  const newRows = result.rows.filter((r) => !r.existingId).map(toData);
  const updateRows = result.rows.filter((r) => r.existingId);

  // Ratusan baris bisa butuh waktu lebih dari batas default transaksi (5 detik)
  await prisma.$transaction(
    async (tx) => {
      if (newRows.length) await tx.asset.createMany({ data: newRows });
      for (const row of updateRows) {
        await tx.asset.update({ where: { id: row.existingId! }, data: toData(row) });
      }
    },
    { timeout: 120_000 },
  );

  res.status(201).json({
    message: `${newRows.length} asset baru, ${updateRows.length} asset diperbarui`,
    created: newRows.length,
    updated: updateRows.length,
  });
});

// GET /api/assets/:id
router.get("/:id", async (req, res) => {
  const asset = await prisma.asset.findUnique({
    where: { id: Number(req.params.id) },
    include,
  });

  if (!asset) return res.status(404).json({ message: "Asset tidak ditemukan" });
  res.json(asset);
});

// POST /api/assets
router.post("/", requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const data = parsed.data;

  const category = await prisma.kategoriAset.findUnique({ where: { id: data.categoryId } });
  if (!category) return res.status(422).json(categoryError);

  if (await findDuplicateKode(data.kode)) return res.status(422).json(duplicateError);
  if (await invalidChecksheet(data.checksheetId, data.categoryId)) return res.status(422).json(checksheetError);

  const asset = await prisma.asset.create({ data, include });
  res.status(201).json(asset);
});

// PUT /api/assets/:id
router.put("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const data = parsed.data;

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return res.status(404).json({ message: "Asset tidak ditemukan" });

  const category = await prisma.kategoriAset.findUnique({ where: { id: data.categoryId } });
  if (!category) return res.status(422).json(categoryError);

  if (await findDuplicateKode(data.kode, id)) return res.status(422).json(duplicateError);
  if (await invalidChecksheet(data.checksheetId, data.categoryId)) return res.status(422).json(checksheetError);

  const updated = await prisma.asset.update({ where: { id }, data, include });
  res.json(updated);
});

// DELETE /api/assets/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return res.status(404).json({ message: "Asset tidak ditemukan" });

  await prisma.asset.delete({ where: { id } });
  res.json({ message: "Asset berhasil dihapus" });
});

export default router;
