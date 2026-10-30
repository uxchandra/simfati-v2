import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { buildSparepartTemplate, parseSparepartWorkbook, type ParsedRow } from "../lib/sparepart-excel";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

// Semua route wajib login; tambah/edit/hapus/import khusus admin
router.use(requireAuth);

// File Excel dikirim mentah (application/octet-stream), bukan multipart
const excelBody = express.raw({ type: "application/octet-stream", limit: "10mb" });
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Kolom teks opsional: string kosong disimpan sebagai null
function optionalText(max?: number) {
  const base = z.string().trim();
  return (max ? base.max(max, `Maksimal ${max} karakter`) : base)
    .nullish()
    .transform((value) => value || null);
}

// Kolom angka opsional: kosong = null
const optionalInt = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number({ error: "Harus berupa angka" }).int("Harus bilangan bulat").min(0, "Tidak boleh negatif").nullable(),
);

const schema = z
  .object({
    kodeBarang: z
      .string({ error: "Kode barang wajib diisi" })
      .trim()
      .min(1, "Kode barang wajib diisi")
      .max(255, "Kode barang maksimal 255 karakter"),
    namaBarang: optionalText(255),
    spec: optionalText(255),
    stok: optionalInt,
    minimalStok: optionalInt,
    maksimalStok: optionalInt,
    uom: optionalText(50),
    keterangan: optionalText(),
  })
  .refine((d) => d.minimalStok === null || d.maksimalStok === null || d.minimalStok <= d.maksimalStok, {
    message: "Tidak boleh lebih besar dari maksimal stok",
    path: ["minimalStok"],
  });

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// id BIGINT tidak bisa langsung di-JSON-kan, ubah ke number
type SparepartRow = { id: bigint } & Record<string, unknown>;
const toJson = <T extends SparepartRow>(row: T) => ({ ...row, id: Number(row.id) });

function parseId(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}

// ===== Status stok =====
// habis : stok kosong / 0
// low   : stok > 0 dan stok ≤ minimal stok
// aman  : stok > 0 dan (minimal stok kosong atau stok > minimal stok)
const fields = prisma.sparepart.fields;
const statusWhere = {
  habis: { OR: [{ stok: null }, { stok: { lte: 0 } }] },
  low: { stok: { gt: 0, lte: fields.minimalStok } },
  aman: { AND: [{ stok: { gt: 0 } }, { OR: [{ minimalStok: null }, { stok: { gt: fields.minimalStok } }] }] },
} satisfies Record<string, Prisma.SparepartWhereInput>;

type StockStatus = keyof typeof statusWhere;
const isStatus = (value: unknown): value is StockStatus => typeof value === "string" && value in statusWhere;

// Cek kode kembar (collation MySQL tidak membedakan huruf besar/kecil), kecuali data yang sedang diedit
function findDuplicateKode(kodeBarang: string, exceptId?: bigint) {
  return prisma.sparepart.findFirst({
    where: { kodeBarang, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
}

const duplicateError = { message: "Data tidak valid", errors: { kodeBarang: ["Kode barang sudah dipakai"] } };
const notFound = { message: "Sparepart tidak ditemukan" };

// GET /api/spareparts/stats — angka untuk card di atas tabel
router.get("/stats", async (_req, res) => {
  const [total, aman, low, habis] = await Promise.all([
    prisma.sparepart.count(),
    prisma.sparepart.count({ where: statusWhere.aman }),
    prisma.sparepart.count({ where: statusWhere.low }),
    prisma.sparepart.count({ where: statusWhere.habis }),
  ]);
  res.json({ total, aman, low, habis });
});

// GET /api/spareparts/template — download template Excel
router.get("/template", async (_req, res) => {
  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", 'attachment; filename="template-sparepart.xlsx"');
  res.send(await buildSparepartTemplate());
});

// GET /api/spareparts?search=&status=low&page=1&perPage=25
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const status = req.query.status;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = [10, 25, 50, 100].includes(Number(req.query.perPage)) ? Number(req.query.perPage) : 25;

  const where: Prisma.SparepartWhereInput = {
    AND: [
      isStatus(status) ? statusWhere[status] : {},
      search
        ? {
            OR: [
              { kodeBarang: { contains: search } },
              { namaBarang: { contains: search } },
              { spec: { contains: search } },
            ],
          }
        : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.sparepart.findMany({
      where,
      orderBy: { kodeBarang: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.sparepart.count({ where }),
  ]);

  res.json({ data: data.map(toJson), total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

// GET /api/spareparts/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const sparepart = id && (await prisma.sparepart.findUnique({ where: { id } }));
  if (!sparepart) return res.status(404).json(notFound);
  res.json(toJson(sparepart));
});

// POST /api/spareparts
router.post("/", requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  if (await findDuplicateKode(parsed.data.kodeBarang)) return res.status(422).json(duplicateError);

  const sparepart = await prisma.sparepart.create({ data: parsed.data });
  res.status(201).json(toJson(sparepart));
});

// PUT /api/spareparts/:id
router.put("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !(await prisma.sparepart.findUnique({ where: { id }, select: { id: true } }))) {
    return res.status(404).json(notFound);
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  if (await findDuplicateKode(parsed.data.kodeBarang, id)) return res.status(422).json(duplicateError);

  const updated = await prisma.sparepart.update({ where: { id }, data: parsed.data });
  res.json(toJson(updated));
});

// DELETE /api/spareparts/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !(await prisma.sparepart.findUnique({ where: { id }, select: { id: true } }))) {
    return res.status(404).json(notFound);
  }

  await prisma.sparepart.delete({ where: { id } });
  res.json({ message: "Sparepart berhasil dihapus" });
});

// ===== Import Excel =====

type PreviewRow = ParsedRow & { existingId: number | null };

// Baca file lalu cocokkan kode barang dengan data yang sudah ada
async function buildPreview(body: unknown) {
  if (!Buffer.isBuffer(body) || body.length === 0) return { error: "File Excel wajib diupload" } as const;

  let parsed: Awaited<ReturnType<typeof parseSparepartWorkbook>>;
  try {
    parsed = await parseSparepartWorkbook(body);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan formatnya .xlsx" } as const;
  }
  if ("error" in parsed) return { error: parsed.error } as const;

  const kodes = [...new Set(parsed.rows.map((r) => r.kodeBarang).filter(Boolean))];
  const existing = await prisma.sparepart.findMany({
    where: { kodeBarang: { in: kodes } },
    select: { id: true, kodeBarang: true },
  });
  const existingByKode = new Map(existing.map((s) => [s.kodeBarang.toLowerCase(), Number(s.id)]));

  // Kode barang tidak boleh dobel di dalam file
  const firstRowOfKode = new Map<string, number>();
  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const errors = [...row.errors];
    const key = row.kodeBarang.toLowerCase();
    if (row.kodeBarang) {
      const first = firstRowOfKode.get(key);
      if (first) errors.push(`KODE BARANG sudah dipakai di baris ${first}`);
      else firstRowOfKode.set(key, row.baris);
    }
    return { ...row, errors, existingId: existingByKode.get(key) ?? null };
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

// POST /api/spareparts/import/preview — cek isi file tanpa menyimpan
router.post("/import/preview", requireAdmin, excelBody, async (req, res) => {
  const result = await buildPreview(req.body);
  if ("error" in result) return res.status(422).json({ message: result.error });
  res.json(result);
});

// POST /api/spareparts/import — simpan semua baris; ditolak kalau ada satu saja yang error
router.post("/import", requireAdmin, excelBody, async (req, res) => {
  const result = await buildPreview(req.body);
  if ("error" in result) return res.status(422).json({ message: result.error });
  if (!result.valid) {
    return res.status(422).json({ message: "Masih ada data yang tidak valid, cek preview terlebih dahulu" });
  }

  const toData = ({ baris: _b, errors: _e, existingId: _x, ...data }: PreviewRow) => data;
  const newRows = result.rows.filter((r) => !r.existingId).map(toData);
  const updateRows = result.rows.filter((r) => r.existingId);

  // Ratusan baris bisa butuh waktu lebih dari batas default transaksi (5 detik)
  await prisma.$transaction(
    async (tx) => {
      if (newRows.length) await tx.sparepart.createMany({ data: newRows });
      for (const row of updateRows) {
        await tx.sparepart.update({ where: { id: BigInt(row.existingId!) }, data: toData(row) });
      }
    },
    { timeout: 120_000 },
  );

  res.status(201).json({
    message: `${newRows.length} sparepart baru, ${updateRows.length} sparepart diperbarui`,
    created: newRows.length,
    updated: updateRows.length,
  });
});

export default router;
