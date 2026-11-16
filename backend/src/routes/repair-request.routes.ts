import express, { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";
import { PHOTO_MIME_TYPES, removeUploads, savePhoto } from "../lib/uploads";
import {
  applyAction,
  cancelPart,
  closeBlocker,
  confirmOuthouseOnClose,
  handle,
  hasRepairProgress,
  HttpError,
  installPart,
  parseAction,
  repairDataSelect,
  repairDataToJson,
  repairStateInclude,
} from "../lib/repair-actions";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth";
import { Prisma } from "../generated/prisma/client";

const router = Router();

// Melapor: Ast. Leader (hanya mesin PIC-nya), mekanik & superadmin (semua mesin).
// Menangani (pilih tindakan, pasang part, tutup): mekanik & superadmin.
router.use(requireAuth, requireRole(ROLES.SUPERADMIN, ROLES.MEKANIK, ROLES.AST_LEADER));
const requireHandler = requireRole(ROLES.SUPERADMIN, ROLES.MEKANIK);

const PHOTO_DIR = "repair-photos";
const MAX_PHOTOS = 10;
const photoBody = express.raw({ type: PHOTO_MIME_TYPES, limit: "10mb" });

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const isLeader = (req: Request) => req.user!.role === ROLES.AST_LEADER;

// Ast. Leader hanya melihat laporan yang dia buat sendiri
const scopeWhere = (req: Request): Prisma.RepairRequestWhereInput =>
  isLeader(req) ? { requestedById: req.user!.id } : {};

const assetSelect = {
  id: true,
  kode: true,
  description: true,
  lane: true,
  category: { select: { id: true, name: true } },
} as const;

const listSelect = {
  id: true,
  kode: true,
  problem: true,
  status: true,
  repairAction: true,
  requestedAt: true,
  completedAt: true,
  cancelledAt: true,
  asset: { select: assetSelect },
  requestedBy: { select: { id: true, name: true } },
  outhouseRepair: { select: { status: true } },
  _count: { select: { photos: true } },
} as const;

// GET /api/repair-requests/options/assets — mesin yang boleh dilaporkan user ini
router.get("/options/assets", async (req, res) => {
  const assets = await prisma.asset.findMany({
    where: {
      status: "active",
      ...(isLeader(req) ? { picMesin: { some: { userId: req.user!.id } } } : {}),
    },
    select: assetSelect,
    orderBy: { kode: "asc" },
  });
  res.json(assets);
});

// GET /api/repair-requests?status=&search=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const statuses = ["pending", "in_progress", "completed", "cancelled"] as const;
  const status = statuses.find((s) => s === req.query.status);
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const scope = scopeWhere(req);
  const where: Prisma.RepairRequestWhereInput = {
    ...scope,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { kode: { contains: search } },
            { problem: { contains: search } },
            { asset: { kode: { contains: search } } },
            { asset: { description: { contains: search } } },
            { requestedBy: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [data, total, counts] = await Promise.all([
    prisma.repairRequest.findMany({
      where,
      select: listSelect,
      // Yang masih berjalan: terlama dulu; selesai / batal: terbaru dulu
      orderBy: { requestedAt: status === "pending" || status === "in_progress" ? "asc" : "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.repairRequest.count({ where }),
    prisma.repairRequest.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);

  res.json({
    data,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});

// GET /api/repair-requests/:id
router.get("/:id", async (req, res) => {
  const request = await prisma.repairRequest.findFirst({
    where: { id: parseId(req.params.id) ?? 0, ...scopeWhere(req) },
    select: {
      ...listSelect,
      ...repairDataSelect,
      photos: { select: { id: true, path: true, createdAt: true }, orderBy: { id: "asc" } },
    },
  });
  if (!request) return res.status(404).json({ message: "Repair request tidak ditemukan" });
  res.json(repairDataToJson(request));
});

const createSchema = z.object({
  assetId: z.coerce.number({ error: "Mesin wajib dipilih" }).int().positive("Mesin wajib dipilih"),
  problem: z.string({ error: "Deskripsi problem wajib diisi" }).trim().min(1, "Deskripsi problem wajib diisi"),
});

// POST /api/repair-requests { assetId, problem } — lapor kerusakan
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ message: "Data tidak valid", errors: z.flattenError(parsed.error).fieldErrors });
  }
  const { assetId, problem } = parsed.data;

  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      status: "active",
      ...(isLeader(req) ? { picMesin: { some: { userId: req.user!.id } } } : {}),
    },
    select: { id: true },
  });
  if (!asset) {
    const message = isLeader(req) ? "Mesin tidak ditemukan atau Anda bukan PIC mesin ini" : "Mesin tidak ditemukan / tidak aktif";
    return res.status(422).json({ message: "Data tidak valid", errors: { assetId: [message] } });
  }

  // Nomor laporan per bulan: RR-202611-001. Bentrok saat dibuat bersamaan -> coba nomor berikutnya
  const now = new Date();
  const prefix = `RR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.repairRequest.findFirst({
      where: { kode: { startsWith: prefix } },
      select: { kode: true },
      orderBy: { id: "desc" },
    });
    const kode = prefix + String((last ? Number(last.kode.slice(prefix.length)) || 0 : 0) + 1).padStart(3, "0");
    try {
      const created = await prisma.repairRequest.create({
        data: { kode, assetId, problem, requestedById: req.user!.id, requestedAt: now },
        select: { id: true, kode: true },
      });
      return res.status(201).json({ ...created, message: `Repair request ${created.kode} dibuat` });
    } catch (err) {
      const isDuplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isDuplicate) throw err;
    }
  }
  res.status(409).json({ message: "Gagal membuat nomor laporan, silakan coba lagi" });
});

// Laporan yang masih berjalan & boleh diakses user ini
async function findOpenRequest(req: Request) {
  const request = await prisma.repairRequest.findFirst({
    where: { id: parseId(req.params.id) ?? 0, ...scopeWhere(req) },
    include: repairStateInclude,
  });
  if (!request) throw new HttpError(404, "Repair request tidak ditemukan");
  if (request.status === "completed") throw new HttpError(400, "Repair request ini sudah selesai");
  if (request.status === "cancelled") throw new HttpError(400, "Repair request ini sudah dibatalkan");
  return request;
}

// POST /api/repair-requests/:id/photos — foto kerusakan (body = file gambar mentah)
router.post(
  "/:id/photos",
  photoBody,
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    const count = await prisma.repairRequestPhoto.count({ where: { repairRequestId: request.id } });
    if (count >= MAX_PHOTOS) throw new HttpError(400, `Maksimal ${MAX_PHOTOS} foto per laporan`);

    const relative = await savePhoto(PHOTO_DIR, req.body, req.headers["content-type"]);
    if (!relative) throw new HttpError(422, "File harus berupa gambar JPG, PNG, atau WEBP");

    const photo = await prisma.repairRequestPhoto.create({
      data: { repairRequestId: request.id, path: relative },
      select: { id: true, path: true, createdAt: true },
    });
    res.status(201).json(photo);
  }),
);

// DELETE /api/repair-requests/:id/photos/:photoId
router.delete(
  "/:id/photos/:photoId",
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    const photo = await prisma.repairRequestPhoto.findFirst({
      where: { id: parseId(req.params.photoId) ?? 0, repairRequestId: request.id },
    });
    if (!photo) throw new HttpError(404, "Foto tidak ditemukan");

    await prisma.repairRequestPhoto.delete({ where: { id: photo.id } });
    await removeUploads([photo.path]);
    res.json({ message: "Foto dihapus" });
  }),
);

// POST /api/repair-requests/:id/cancel — batalkan laporan.
// Pelapor: selama belum ada tindakan. Mekanik / superadmin: selama belum ada progres perbaikan.
router.post(
  "/:id/cancel",
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    if (isLeader(req) && request.status !== "pending") {
      throw new HttpError(400, "Laporan sudah ditangani mekanik, tidak bisa dibatalkan");
    }
    if (await hasRepairProgress({ repairRequestId: request.id })) {
      throw new HttpError(400, "Sudah ada part terpasang atau perbaikan subcont yang berjalan, tidak bisa dibatalkan");
    }

    await prisma.$transaction(async (tx) => {
      const where = { repairRequestId: request.id };
      await tx.inhouseRepair.deleteMany({ where });
      await tx.outhouseRepair.deleteMany({ where });
      await tx.checkupPartRequest.deleteMany({ where });
      await tx.repairRequest.update({
        where: { id: request.id },
        data: { status: "cancelled", cancelledAt: new Date(), repairAction: null },
      });
    });
    res.json({ message: `Repair request ${request.kode} dibatalkan` });
  }),
);

// ===== Penanganan (mekanik & superadmin) =====

// POST /api/repair-requests/:id/action — pilih / ubah tindakan
router.post(
  "/:id/action",
  requireHandler,
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    const input = parseAction(req.body);
    const message = await applyAction({ repairRequestId: request.id }, request, input, req.user!.id, (tx, action) =>
      tx.repairRequest.update({ where: { id: request.id }, data: { repairAction: action, status: "in_progress" } }),
    );
    res.json({ message });
  }),
);

// POST /api/repair-requests/:id/parts/:partId/install — tandai part terpasang & kurangi stok
router.post(
  "/:id/parts/:partId/install",
  requireHandler,
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    res.json({ message: await installPart({ repairRequestId: request.id }, req.params.partId) });
  }),
);

// DELETE /api/repair-requests/:id/parts/:partId — batalkan permintaan part yang belum terpasang
router.delete(
  "/:id/parts/:partId",
  requireHandler,
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    const message = await cancelPart({ repairRequestId: request.id }, req.params.partId, (tx) =>
      tx.repairRequest.update({ where: { id: request.id }, data: { repairAction: null, status: "pending" } }),
    );
    res.json({ message });
  }),
);

// POST /api/repair-requests/:id/close — tutup laporan setelah perbaikan selesai
router.post(
  "/:id/close",
  requireHandler,
  handle(async (req, res) => {
    const request = await findOpenRequest(req);
    const blocker = closeBlocker(request);
    if (blocker) throw new HttpError(400, blocker);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await confirmOuthouseOnClose(tx, { repairRequestId: request.id }, request, now);
      await tx.repairRequest.update({ where: { id: request.id }, data: { status: "completed", completedAt: now } });
    });
    res.json({ message: `Repair request ${request.kode} selesai` });
  }),
);

// DELETE /api/repair-requests/:id — hapus laporan (khusus superadmin)
router.delete(
  "/:id",
  requireAdmin,
  handle(async (req, res) => {
    const request = await prisma.repairRequest.findUnique({
      where: { id: parseId(req.params.id) ?? 0 },
      select: { id: true, kode: true, photos: { select: { path: true } } },
    });
    if (!request) throw new HttpError(404, "Repair request tidak ditemukan");
    if (await hasRepairProgress({ repairRequestId: request.id })) {
      throw new HttpError(400, "Laporan ini sudah punya part terpasang atau perbaikan subcont yang berjalan, tidak bisa dihapus");
    }

    await prisma.repairRequest.delete({ where: { id: request.id } });
    await removeUploads(request.photos.map((p) => p.path));
    res.json({ message: `Repair request ${request.kode} dihapus` });
  }),
);

export default router;
