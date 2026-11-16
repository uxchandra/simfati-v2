import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Kelola role khusus superadmin
router.use(requireAuth, requireAdmin);

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  _count: { select: { users: true } },
} as const;

const schema = z.object({
  code: z
    .string({ error: "Kode wajib diisi" })
    .trim()
    .toLowerCase()
    .min(1, "Kode wajib diisi")
    .max(50, "Kode maksimal 50 karakter")
    .regex(/^[a-z0-9_]+$/, "Kode hanya boleh huruf kecil, angka, dan garis bawah (_)"),
  name: z.string({ error: "Nama wajib diisi" }).trim().min(1, "Nama wajib diisi").max(100, "Nama maksimal 100 karakter"),
  description: z
    .string()
    .trim()
    .max(255, "Deskripsi maksimal 255 karakter")
    .nullish()
    .transform((value) => value || null),
});

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

// _count.users -> userCount supaya frontend tidak perlu tahu bentuk Prisma
type RoleRow = { _count: { users: number } } & Record<string, unknown>;
const toJson = ({ _count, ...role }: RoleRow) => ({ ...role, userCount: _count.users });

function codeTaken(code: string, exceptId?: number) {
  return prisma.role.findFirst({ where: { code, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
}

// GET /api/roles -> semua role (jumlahnya sedikit, tanpa paginasi)
router.get("/", async (_req, res) => {
  const roles = await prisma.role.findMany({ select: roleSelect, orderBy: { id: "asc" } });
  res.json(roles.map(toJson));
});

// POST /api/roles
router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  if (await codeTaken(parsed.data.code)) {
    return res.status(422).json({ message: "Data tidak valid", errors: { code: ["Kode sudah dipakai"] } });
  }

  const role = await prisma.role.create({ data: parsed.data, select: roleSelect });
  res.status(201).json(toJson(role));
});

// PUT /api/roles/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return res.status(404).json({ message: "Role tidak ditemukan" });

  // Role sistem: code dipakai kode untuk cek hak akses, jadi tidak boleh diubah
  const parsed = schema.safeParse(role.isSystem ? { ...req.body, code: role.code } : req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  if (await codeTaken(parsed.data.code, id)) {
    return res.status(422).json({ message: "Data tidak valid", errors: { code: ["Kode sudah dipakai"] } });
  }

  const updated = await prisma.role.update({ where: { id }, data: parsed.data, select: roleSelect });
  res.json(toJson(updated));
});

// DELETE /api/roles/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const role = await prisma.role.findUnique({ where: { id }, select: roleSelect });
  if (!role) return res.status(404).json({ message: "Role tidak ditemukan" });

  if (role.isSystem) {
    return res.status(400).json({ message: "Role sistem tidak bisa dihapus" });
  }
  if (role._count.users > 0) {
    return res.status(400).json({
      message: `Role masih dipakai ${role._count.users} user. Pindahkan user ke role lain dulu.`,
    });
  }

  await prisma.role.delete({ where: { id } });
  res.json({ message: "Role berhasil dihapus" });
});

export default router;
