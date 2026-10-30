import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Semua route wajib login; tambah/edit/hapus khusus admin
router.use(requireAuth);

const kategoriSelect = {
  id: true,
  name: true,
  createdAt: true,
} as const;

const schema = z.object({
  name: z.string({ error: "Nama wajib diisi" }).trim().min(1, "Nama wajib diisi"),
});

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// Cek nama kembar (tidak membedakan huruf besar/kecil), kecuali data yang sedang diedit
function findDuplicate(name: string, exceptId?: number) {
  return prisma.kategoriAset.findFirst({
    where: {
      name: { equals: name },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
}

const duplicateError = { message: "Data tidak valid", errors: { name: ["Nama kategori sudah ada"] } };

// GET /api/kategori-aset?search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = search ? { name: { contains: search } } : {};

  const [data, total] = await Promise.all([
    prisma.kategoriAset.findMany({
      where,
      select: kategoriSelect,
      orderBy: { id: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.kategoriAset.count({ where }),
  ]);

  res.json({ data, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

// GET /api/kategori-aset/all — semua data tanpa pagination (untuk menu sidebar & dropdown)
router.get("/all", async (_req, res) => {
  const data = await prisma.kategoriAset.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(data);
});

// GET /api/kategori-aset/:id
router.get("/:id", async (req, res) => {
  const kategori = await prisma.kategoriAset.findUnique({
    where: { id: Number(req.params.id) },
    select: kategoriSelect,
  });

  if (!kategori) return res.status(404).json({ message: "Kategori aset tidak ditemukan" });
  res.json(kategori);
});

// POST /api/kategori-aset
router.post("/", requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name } = parsed.data;

  if (await findDuplicate(name)) return res.status(422).json(duplicateError);

  const kategori = await prisma.kategoriAset.create({
    data: { name },
    select: kategoriSelect,
  });

  res.status(201).json(kategori);
});

// PUT /api/kategori-aset/:id
router.put("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name } = parsed.data;

  const kategori = await prisma.kategoriAset.findUnique({ where: { id } });
  if (!kategori) return res.status(404).json({ message: "Kategori aset tidak ditemukan" });

  if (await findDuplicate(name, id)) return res.status(422).json(duplicateError);

  const updated = await prisma.kategoriAset.update({
    where: { id },
    data: { name },
    select: kategoriSelect,
  });

  res.json(updated);
});

// DELETE /api/kategori-aset/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const kategori = await prisma.kategoriAset.findUnique({ where: { id } });
  if (!kategori) return res.status(404).json({ message: "Kategori aset tidak ditemukan" });

  // Tabel assets punya FK ke kategori ini, jadi tolak kalau masih dipakai
  const assetCount = await prisma.asset.count({ where: { categoryId: id } });
  if (assetCount > 0) {
    return res
      .status(400)
      .json({ message: `Kategori masih dipakai oleh ${assetCount} asset, tidak bisa dihapus` });
  }

  const checksheetCount = await prisma.checksheet.count({ where: { categoryId: id } });
  if (checksheetCount > 0) {
    return res
      .status(400)
      .json({ message: `Kategori masih dipakai oleh ${checksheetCount} checksheet, tidak bisa dihapus` });
  }

  const planCount = await prisma.preventivePlan.count({ where: { categoryId: id } });
  if (planCount > 0) {
    return res
      .status(400)
      .json({ message: `Kategori masih punya ${planCount} baris jadwal preventive, tidak bisa dihapus` });
  }

  await prisma.kategoriAset.delete({ where: { id } });
  res.json({ message: "Kategori aset berhasil dihapus" });
});

export default router;
