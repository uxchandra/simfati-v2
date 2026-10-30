import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Semua route wajib login; tambah/edit/hapus khusus admin
router.use(requireAuth);

const categorySelect = {
  id: true,
  name: true,
  createdAt: true,
} as const;

const schema = z.object({
  name: z
    .string({ error: "Nama wajib diisi" })
    .trim()
    .min(1, "Nama wajib diisi")
    .max(100, "Nama maksimal 100 karakter"),
});

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// Cek nama kembar (tidak membedakan huruf besar/kecil), kecuali data yang sedang diedit
function findDuplicate(name: string, exceptId?: number) {
  return prisma.repairCategory.findFirst({
    where: {
      name: { equals: name },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
}

const duplicateError = { message: "Data tidak valid", errors: { name: ["Nama kategori sudah ada"] } };

// GET /api/repair-categories?search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = search ? { name: { contains: search } } : {};

  const [data, total] = await Promise.all([
    prisma.repairCategory.findMany({
      where,
      select: categorySelect,
      orderBy: { id: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.repairCategory.count({ where }),
  ]);

  res.json({ data, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

// GET /api/repair-categories/:id
router.get("/:id", async (req, res) => {
  const category = await prisma.repairCategory.findUnique({
    where: { id: Number(req.params.id) },
    select: categorySelect,
  });

  if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan" });
  res.json(category);
});

// POST /api/repair-categories
router.post("/", requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name } = parsed.data;

  if (await findDuplicate(name)) return res.status(422).json(duplicateError);

  const category = await prisma.repairCategory.create({
    data: { name },
    select: categorySelect,
  });

  res.status(201).json(category);
});

// PUT /api/repair-categories/:id
router.put("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name } = parsed.data;

  const category = await prisma.repairCategory.findUnique({ where: { id } });
  if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan" });

  if (await findDuplicate(name, id)) return res.status(422).json(duplicateError);

  const updated = await prisma.repairCategory.update({
    where: { id },
    data: { name },
    select: categorySelect,
  });

  res.json(updated);
});

// DELETE /api/repair-categories/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const category = await prisma.repairCategory.findUnique({ where: { id } });
  if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan" });

  await prisma.repairCategory.delete({ where: { id } });
  res.json({ message: "Kategori berhasil dihapus" });
});

export default router;
