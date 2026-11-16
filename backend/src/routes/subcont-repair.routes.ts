import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";
import { requireAuth, requireRole } from "../middleware/auth";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

// Halaman perbaikan untuk user role subcont: hanya melihat & mengerjakan perbaikan perusahaannya sendiri
router.use(requireAuth, requireRole(ROLES.SUBCONT), (req: Request, res: Response, next: NextFunction) => {
  if (!req.user!.subcontId) {
    return res.status(403).json({ message: "Akun ini belum terhubung ke perusahaan subcont. Hubungi admin." });
  }
  next();
});

const assetSelect = { kode: true, description: true, lane: true, category: { select: { name: true } } } as const;

const repairSelect = {
  id: true,
  problem: true,
  perbaikan: true,
  status: true,
  hasil: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  confirmedAt: true,
  user: { select: { name: true } },
  // Sumber perbaikan: poin NG general checkup ATAU repair request
  detail: {
    select: {
      bagian: true,
      poin: true,
      standar: true,
      notes: true,
      checkup: { select: { kode: true, asset: { select: assetSelect } } },
    },
  },
  repairRequest: { select: { kode: true, problem: true, asset: { select: assetSelect } } },
} as const;

type RepairRow = Prisma.OuthouseRepairGetPayload<{ select: typeof repairSelect }>;

// Satukan bentuk sumber supaya frontend cukup membaca `source`
function toJson({ detail, repairRequest, ...repair }: RepairRow) {
  const source = detail
    ? {
        type: "checkup" as const,
        kode: detail.checkup.kode,
        asset: detail.checkup.asset,
        bagian: detail.bagian,
        poin: detail.poin,
        standar: detail.standar,
        notes: detail.notes,
      }
    : {
        type: "repair_request" as const,
        kode: repairRequest!.kode,
        asset: repairRequest!.asset,
        bagian: null,
        poin: null,
        standar: null,
        notes: repairRequest!.problem,
      };
  return { ...repair, source };
}

// GET /api/subcont-repairs?view=active|history&page=1
// active  = menunggu dimulai, sedang dikerjakan, menunggu konfirmasi
// history = sudah dikonfirmasi selesai
router.get("/", async (req, res) => {
  const history = req.query.view === "history";
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where: Prisma.OuthouseRepairWhereInput = {
    subcontId: req.user!.subcontId!,
    status: history ? "completed" : { not: "completed" },
  };

  const [data, total, counts] = await Promise.all([
    prisma.outhouseRepair.findMany({
      where,
      select: repairSelect,
      // Aktif: yang terlama dulu supaya dikerjakan berurutan; history: terbaru dulu
      orderBy: history ? { confirmedAt: "desc" } : { createdAt: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.outhouseRepair.count({ where }),
    prisma.outhouseRepair.groupBy({
      by: ["status"],
      where: { subcontId: req.user!.subcontId! },
      _count: { _all: true },
    }),
  ]);

  res.json({
    data: data.map(toJson),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});

function findOwnRepair(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.outhouseRepair.findFirst({ where: { id, subcontId: req.user!.subcontId! } });
}

// POST /api/subcont-repairs/:id/start — subcont mulai mengerjakan
router.post("/:id/start", async (req, res) => {
  const repair = await findOwnRepair(req);
  if (!repair) return res.status(404).json({ message: "Perbaikan tidak ditemukan" });
  if (repair.status !== "pending") return res.status(400).json({ message: "Perbaikan ini sudah dimulai" });

  await prisma.outhouseRepair.update({ where: { id: repair.id }, data: { status: "on_progress", startedAt: new Date() } });
  res.json({ message: "Perbaikan dimulai" });
});

const finishSchema = z.object({
  hasil: z.string({ error: "Laporan hasil wajib diisi" }).trim().min(1, "Laporan hasil wajib diisi"),
});

// POST /api/subcont-repairs/:id/finish { hasil } — subcont selesai, menunggu konfirmasi mekanik
router.post("/:id/finish", async (req, res) => {
  const repair = await findOwnRepair(req);
  if (!repair) return res.status(404).json({ message: "Perbaikan tidak ditemukan" });
  if (repair.status === "pending") return res.status(400).json({ message: "Mulai perbaikan terlebih dahulu" });
  if (repair.status !== "on_progress") return res.status(400).json({ message: "Perbaikan ini sudah diselesaikan" });

  const parsed = finishSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ message: "Data tidak valid", errors: z.flattenError(parsed.error).fieldErrors });
  }

  await prisma.outhouseRepair.update({
    where: { id: repair.id },
    data: { status: "waiting_confirmation", finishedAt: new Date(), hasil: parsed.data.hasil },
  });
  res.json({ message: "Perbaikan selesai, menunggu konfirmasi dari mekanik" });
});

export default router;
