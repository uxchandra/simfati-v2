import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Semua route wajib login; tambah/edit/hapus khusus admin
router.use(requireAuth);

const subcontSelect = {
  id: true,
  nama: true,
  alamat: true,
  noTelp: true,
  pic: true,
  status: true,
  createdAt: true,
} as const;

// Kolom opsional: string kosong disimpan sebagai null
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value || null);

const schema = z.object({
  nama: z.string({ error: "Nama wajib diisi" }).trim().min(1, "Nama wajib diisi"),
  alamat: optionalText,
  noTelp: optionalText,
  pic: optionalText,
  status: z.enum(["active", "inactive"], { error: "Status tidak valid" }),
});

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// GET /api/subcont?search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = search
    ? {
        OR: [
          { nama: { contains: search } },
          { pic: { contains: search } },
          { noTelp: { contains: search } },
        ],
      }
    : {};

  const [data, total] = await Promise.all([
    prisma.subcont.findMany({
      where,
      select: subcontSelect,
      orderBy: { id: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.subcont.count({ where }),
  ]);

  res.json({ data, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

// GET /api/subcont/:id
router.get("/:id", async (req, res) => {
  const subcont = await prisma.subcont.findUnique({
    where: { id: Number(req.params.id) },
    select: subcontSelect,
  });

  if (!subcont) return res.status(404).json({ message: "Subcont tidak ditemukan" });
  res.json(subcont);
});

// POST /api/subcont
router.post("/", requireAdmin, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const subcont = await prisma.subcont.create({
    data: parsed.data,
    select: subcontSelect,
  });

  res.status(201).json(subcont);
});

// PUT /api/subcont/:id
router.put("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const subcont = await prisma.subcont.findUnique({ where: { id } });
  if (!subcont) return res.status(404).json({ message: "Subcont tidak ditemukan" });

  const updated = await prisma.subcont.update({
    where: { id },
    data: parsed.data,
    select: subcontSelect,
  });

  res.json(updated);
});

// DELETE /api/subcont/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const subcont = await prisma.subcont.findUnique({ where: { id } });
  if (!subcont) return res.status(404).json({ message: "Subcont tidak ditemukan" });

  await prisma.subcont.delete({ where: { id } });
  res.json({ message: "Subcont berhasil dihapus" });
});

export default router;
