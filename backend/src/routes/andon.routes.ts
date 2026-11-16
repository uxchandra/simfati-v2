import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";
import { currentPeriod, dueScheduleWhere } from "../lib/checkup";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Papan andon (layar TV di lantai produksi): hanya baca, tampil semua data
router.use(requireAuth, requireRole(ROLES.SUPERADMIN, ROLES.MEKANIK, ROLES.AST_LEADER));

const assetSelect = { kode: true, description: true, lane: true, category: { select: { name: true } } } as const;

// Rentang tanggal minggu berjalan (W1 = 1–7, ..., W4 = 22–akhir bulan)
function weekRange(now: Date) {
  const { minggu } = currentPeriod(now);
  const start = new Date(now.getFullYear(), now.getMonth(), (minggu - 1) * 7 + 1);
  const end = minggu === 4 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear(), now.getMonth(), minggu * 7 + 1);
  return { start, end };
}

// GET /api/andon/general-checkup
router.get("/general-checkup", async (_req, res) => {
  const now = new Date();
  const period = currentPeriod(now);
  const week = weekRange(now);

  const [checkups, schedules, completedThisWeek] = await Promise.all([
    prisma.generalCheckup.findMany({
      where: { status: "on_progress" },
      select: {
        id: true,
        kode: true,
        startedAt: true,
        submittedAt: true,
        asset: { select: assetSelect },
        user: { select: { name: true } },
        schedule: { select: { bulan: true, minggu: true, plan: { select: { tahun: true } } } },
      },
      orderBy: { startedAt: "asc" },
    }),
    prisma.preventiveSchedule.findMany({
      where: {
        AND: [dueScheduleWhere(now), { status: "planned", generalCheckup: { is: null }, plan: { assetId: { not: null } } }],
      },
      select: {
        id: true,
        bulan: true,
        minggu: true,
        tipe: true,
        plan: { select: { tahun: true, asset: { select: { ...assetSelect, checksheet: { select: { id: true } } } } } },
      },
    }),
    prisma.generalCheckup.count({ where: { status: "completed", completedAt: { gte: week.start, lt: week.end } } }),
  ]);

  // Progres pengisian & NG terbuka per checkup
  const ids = checkups.map((c) => c.id);
  const [byResult, openNg] = ids.length
    ? await Promise.all([
        prisma.checkupDetail.groupBy({ by: ["checkupId", "result"], where: { checkupId: { in: ids } }, _count: { _all: true } }),
        prisma.checkupDetail.groupBy({
          by: ["checkupId"],
          where: { checkupId: { in: ids }, result: "NG", ngClosedAt: null },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const progress = new Map(ids.map((id) => [id, { filled: 0, total: 0, ngOpen: 0 }]));
  for (const r of byResult) {
    const p = progress.get(r.checkupId)!;
    p.total += r._count._all;
    if (r.result !== "PENDING") p.filled += r._count._all;
  }
  for (const r of openNg) progress.get(r.checkupId)!.ngOpen = r._count._all;

  const isCurrent = (s: { tahun: number; bulan: number; minggu: number }) =>
    s.tahun === period.tahun && s.bulan === period.bulan && s.minggu === period.minggu;

  const rows = [
    ...checkups.map((c) => ({
      key: `c${c.id}`,
      status: c.submittedAt ? ("waiting_ng" as const) : ("in_progress" as const),
      kode: c.kode,
      asset: c.asset,
      jadwal: c.schedule ? { tahun: c.schedule.plan.tahun, bulan: c.schedule.bulan, minggu: c.schedule.minggu } : null,
      pic: c.user.name,
      startedAt: c.startedAt,
      progress: progress.get(c.id)!,
    })),
    ...schedules
      .map((s) => {
        const jadwal = { tahun: s.plan.tahun, bulan: s.bulan, minggu: s.minggu };
        const { checksheet, ...asset } = s.plan.asset!;
        return {
          key: `s${s.id}`,
          status: isCurrent(jadwal) ? ("planned" as const) : ("overdue" as const),
          kode: null,
          asset,
          jadwal,
          pic: null,
          startedAt: null,
          progress: null,
          noChecksheet: !checksheet,
        };
      })
      // Terlambat dulu (terlama di atas), lalu jadwal minggu ini
      .sort(
        (a, b) =>
          (a.status === "overdue" ? 0 : 1) - (b.status === "overdue" ? 0 : 1) ||
          a.jadwal.tahun - b.jadwal.tahun ||
          a.jadwal.bulan - b.jadwal.bulan ||
          a.jadwal.minggu - b.jadwal.minggu ||
          a.asset.kode.localeCompare(b.asset.kode),
      ),
  ];

  res.json({
    now,
    period,
    counts: {
      planned: rows.filter((r) => r.status === "planned").length,
      overdue: rows.filter((r) => r.status === "overdue").length,
      inProgress: rows.filter((r) => r.status === "in_progress").length,
      waitingNg: rows.filter((r) => r.status === "waiting_ng").length,
      completedThisWeek,
    },
    rows,
  });
});

// GET /api/andon/repair-request
router.get("/repair-request", async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [requests, completedToday] = await Promise.all([
    prisma.repairRequest.findMany({
      where: { status: { in: ["pending", "in_progress"] } },
      select: {
        id: true,
        kode: true,
        problem: true,
        status: true,
        repairAction: true,
        requestedAt: true,
        asset: { select: assetSelect },
        requestedBy: { select: { name: true } },
        outhouseRepair: { select: { status: true, subcont: { select: { nama: true } } } },
        partRequests: { select: { installedAt: true } },
      },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.repairRequest.count({ where: { status: "completed", completedAt: { gte: todayStart } } }),
  ]);

  const rows = requests.map(({ partRequests, ...r }) => ({
    ...r,
    // Status papan: menunggu tindakan / dikerjakan internal / di subcont
    board: r.status === "pending" ? ("waiting" as const) : r.repairAction === "outhouse" ? ("subcont" as const) : ("repair" as const),
    parts: r.repairAction === "ganti_part" ? { installed: partRequests.filter((p) => p.installedAt).length, total: partRequests.length } : null,
  }));

  res.json({
    now,
    counts: {
      waiting: rows.filter((r) => r.board === "waiting").length,
      repair: rows.filter((r) => r.board === "repair").length,
      subcont: rows.filter((r) => r.board === "subcont").length,
      completedToday,
    },
    rows,
  });
});

export default router;
