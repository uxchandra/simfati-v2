import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";
import { userSelect } from "../lib/user-select";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Semua route user wajib login + superadmin
router.use(requireAuth, requireAdmin);

const idField = (message: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    z.number({ error: message }).int(message).positive(message),
  );

const createSchema = z.object({
  name: z.string({ error: "Nama wajib diisi" }).trim().min(1, "Nama wajib diisi"),
  email: z.email("Format email tidak valid"),
  password: z.string({ error: "Password wajib diisi" }).min(6, "Password minimal 6 karakter"),
  roleId: idField("Role wajib dipilih"),
  subcontId: idField("Subcont tidak valid").optional(),
});

// Saat edit, password boleh kosong (artinya tidak diubah)
const updateSchema = createSchema.extend({
  password: z.union([z.string().min(6, "Password minimal 6 karakter"), z.literal("")]).optional(),
});

type FieldErrors = Record<string, string[]>;

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

function invalid(errors: FieldErrors) {
  return { message: "Data tidak valid", errors };
}

// Cek role & subcont ke database. User role subcont wajib punya subcont, role lain tidak.
// Mengembalikan subcontId yang akan disimpan, atau error per field.
async function resolveRoleAndSubcont(
  roleId: number,
  subcontId: number | undefined,
): Promise<{ subcontId: number | null; roleCode: string } | { errors: FieldErrors }> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { code: true } });
  if (!role) return { errors: { roleId: ["Role tidak ditemukan"] } };

  if (role.code !== ROLES.SUBCONT) return { subcontId: null, roleCode: role.code };

  if (!subcontId) return { errors: { subcontId: ["Subcont wajib dipilih untuk role Subcont"] } };
  const subcont = await prisma.subcont.findUnique({ where: { id: subcontId }, select: { id: true } });
  if (!subcont) return { errors: { subcontId: ["Subcont tidak ditemukan"] } };

  return { subcontId, roleCode: role.code };
}

// GET /api/users?search=&roleId=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const roleId = Number(req.query.roleId) || undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = {
    ...(roleId ? { roleId } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
  };

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

// GET /api/users/options -> pilihan role & subcont aktif untuk form user
router.get("/options", async (_req, res) => {
  const [roles, subconts] = await Promise.all([
    prisma.role.findMany({ select: { id: true, code: true, name: true }, orderBy: { id: "asc" } }),
    prisma.subcont.findMany({
      where: { status: "active" },
      select: { id: true, nama: true },
      orderBy: { nama: "asc" },
    }),
  ]);
  res.json({ roles, subconts });
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

  const { name, email, password, roleId } = parsed.data;

  const resolved = await resolveRoleAndSubcont(roleId, parsed.data.subcontId);
  if ("errors" in resolved) return res.status(422).json(invalid(resolved.errors));

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(422).json(invalid({ email: ["Email sudah dipakai"] }));

  const user = await prisma.user.create({
    data: {
      name,
      email,
      roleId,
      subcontId: resolved.subcontId,
      password: await bcrypt.hash(password, 10),
    },
    select: userSelect,
  });

  res.status(201).json(user);
});

// PUT /api/users/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { name, email, password, roleId } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

  const resolved = await resolveRoleAndSubcont(roleId, parsed.data.subcontId);
  if ("errors" in resolved) return res.status(422).json(invalid(resolved.errors));

  // Cegah superadmin mengunci dirinya sendiri dari menu admin
  if (id === req.user!.id && resolved.roleCode !== ROLES.SUPERADMIN) {
    return res.status(422).json(invalid({ roleId: ["Tidak bisa mengubah role akun sendiri"] }));
  }

  const emailUsed = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (emailUsed) return res.status(422).json(invalid({ email: ["Email sudah dipakai"] }));

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name,
      email,
      roleId,
      subcontId: resolved.subcontId,
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

  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { generalCheckups: true, repairRequests: true } } },
  });
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (user._count.generalCheckups > 0 || user._count.repairRequests > 0) {
    return res.status(400).json({
      message: `User ini punya riwayat (${user._count.generalCheckups} general checkup, ${user._count.repairRequests} repair request), tidak bisa dihapus`,
    });
  }

  await prisma.user.delete({ where: { id } });
  res.json({ message: "User berhasil dihapus" });
});

export default router;
