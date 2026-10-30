import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// Semua route wajib login; tambah/edit/hapus khusus admin
router.use(requireAuth);

const assetIdsSchema = z
  .array(z.coerce.number().int().positive(), { error: "Mesin wajib dipilih" })
  .min(1, "Pilih minimal 1 mesin")
  .transform((ids) => [...new Set(ids)]);

const createSchema = z.object({
  userId: z.coerce.number({ error: "User wajib dipilih" }).int().positive("User wajib dipilih"),
  assetIds: assetIdsSchema,
});

const updateSchema = z.object({ assetIds: assetIdsSchema });

function validationError(error: z.ZodError) {
  return { message: "Data tidak valid", errors: z.flattenError(error).fieldErrors };
}

const userSelect = { id: true, name: true, email: true } as const;
const assetSelect = {
  id: true,
  kode: true,
  model: true,
  category: { select: { id: true, name: true } },
} as const;

// Satu baris = satu user beserta semua mesin yang menjadi tanggung jawabnya
function findPicByUser(userId: number) {
  return prisma.user.findFirst({
    where: { id: userId, picMesin: { some: {} } },
    select: {
      ...userSelect,
      picMesin: { select: { asset: { select: assetSelect } }, orderBy: { asset: { kode: "asc" } } },
    },
  });
}

type UserWithPic = NonNullable<Awaited<ReturnType<typeof findPicByUser>>>;

function toResponse({ picMesin, ...user }: UserWithPic) {
  return { user, assets: picMesin.map((p) => p.asset) };
}

// Pastikan semua id mesin memang ada
async function findMissingAssets(assetIds: number[]) {
  const found = await prisma.asset.count({ where: { id: { in: assetIds } } });
  return found !== assetIds.length;
}

const assetError = { message: "Data tidak valid", errors: { assetIds: ["Ada mesin yang tidak ditemukan"] } };

// GET /api/pic-mesin/options/users — semua user untuk dropdown
router.get("/options/users", requireAdmin, async (_req, res) => {
  const data = await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } });
  res.json(data);
});

// GET /api/pic-mesin/options/assets?categoryId=1 — semua mesin dalam satu kategori untuk pilihan
router.get("/options/assets", requireAdmin, async (req, res) => {
  const categoryId = Number(req.query.categoryId) || undefined;
  const data = await prisma.asset.findMany({
    where: categoryId ? { categoryId } : {},
    select: assetSelect,
    orderBy: { kode: "asc" },
  });
  res.json(data);
});

// GET /api/pic-mesin?search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  // Hanya user yang punya minimal 1 mesin; cari berdasarkan nama/email user atau kode/model mesin
  const where = {
    picMesin: { some: {} },
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { picMesin: { some: { asset: { kode: { contains: search } } } } },
            { picMesin: { some: { asset: { model: { contains: search } } } } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        ...userSelect,
        picMesin: { select: { asset: { select: assetSelect } }, orderBy: { asset: { kode: "asc" } } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    data: users.map(toResponse),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
});

// GET /api/pic-mesin/:userId
router.get("/:userId", async (req, res) => {
  const pic = await findPicByUser(Number(req.params.userId));
  if (!pic) return res.status(404).json({ message: "Data PIC mesin tidak ditemukan" });
  res.json(toResponse(pic));
});

// POST /api/pic-mesin — { userId, assetIds: [] }
router.post("/", requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { userId, assetIds } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(422).json({ message: "Data tidak valid", errors: { userId: ["User tidak ditemukan"] } });
  }

  // Satu user cukup satu baris; untuk menambah mesin gunakan edit
  if (await prisma.picMesin.findFirst({ where: { userId } })) {
    return res.status(422).json({
      message: "Data tidak valid",
      errors: { userId: ["User ini sudah menjadi PIC, silakan edit datanya"] },
    });
  }

  if (await findMissingAssets(assetIds)) return res.status(422).json(assetError);

  await prisma.picMesin.createMany({ data: assetIds.map((assetId) => ({ userId, assetId })) });
  res.status(201).json(toResponse((await findPicByUser(userId))!));
});

// PUT /api/pic-mesin/:userId — ganti seluruh daftar mesin milik user
router.put("/:userId", requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(validationError(parsed.error));

  const { assetIds } = parsed.data;

  if (!(await findPicByUser(userId))) {
    return res.status(404).json({ message: "Data PIC mesin tidak ditemukan" });
  }

  if (await findMissingAssets(assetIds)) return res.status(422).json(assetError);

  // Hapus mesin yang tidak dipilih lagi, tambahkan yang baru
  await prisma.$transaction([
    prisma.picMesin.deleteMany({ where: { userId, assetId: { notIn: assetIds } } }),
    prisma.picMesin.createMany({
      data: assetIds.map((assetId) => ({ userId, assetId })),
      skipDuplicates: true,
    }),
  ]);

  res.json(toResponse((await findPicByUser(userId))!));
});

// DELETE /api/pic-mesin/:userId — hapus semua mesin milik user
router.delete("/:userId", requireAdmin, async (req, res) => {
  const { count } = await prisma.picMesin.deleteMany({ where: { userId: Number(req.params.userId) } });
  if (count === 0) return res.status(404).json({ message: "Data PIC mesin tidak ditemukan" });
  res.json({ message: "Data PIC mesin berhasil dihapus" });
});

export default router;
