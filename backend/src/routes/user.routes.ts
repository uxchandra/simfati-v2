import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Semua route user wajib login + admin
router.use(requireAuth, requireAdmin);

// Kolom yang boleh dikirim ke frontend (password TIDAK ikut)
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

const createSchema = z.object({
  name: z.string({ error: "Nama wajib diisi" }).trim().min(1, "Nama wajib diisi"),
  email: z.email("Format email tidak valid"),
  password: z.string({ error: "Password wajib diisi" }).min(6, "Password minimal 6 karakter"),
  role: z.enum(["ADMIN", "USER"], { error: "Role tidak valid" }),
});

// Saat edit, password boleh kosong (artinya tidak diubah)
const updateSchema = createSchema.extend({
  password: z.union([z.string().min(6, "Password minimal 6 karakter"), z.literal("")]).optional(),
});

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// GET /api/users?search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { id: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ data, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

// GET /api/users/:id
router.get("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    select: userSelect,
  });

  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  res.json(user);
});

// POST /api/users
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name, email, password, role } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(422).json({ message: "Data tidak valid", errors: { email: ["Email sudah dipakai"] } });
  }

  const user = await prisma.user.create({
    data: { name, email, role, password: await bcrypt.hash(password, 10) },
    select: userSelect,
  });

  res.status(201).json(user);
});

// PUT /api/users/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name, email, password, role } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

  const emailUsed = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (emailUsed) {
    return res.status(422).json({ message: "Data tidak valid", errors: { email: ["Email sudah dipakai"] } });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name,
      email,
      role,
      // Hanya update password kalau diisi
      ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
    },
    select: userSelect,
  });

  res.json(updated);
});

// DELETE /api/users/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.user!.id) {
    return res.status(400).json({ message: "Tidak bisa menghapus akun sendiri" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

  await prisma.user.delete({ where: { id } });
  res.json({ message: "User berhasil dihapus" });
});

export default router;