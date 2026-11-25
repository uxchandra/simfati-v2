import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";
import { currentPeriod } from "../lib/checkup";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// 12 bulan terakhir (termasuk bulan ini): [{ key: "2026-11", tahun, bulan }]
function lastMonths(now: Date, count = 12) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth() + 1}`, tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
  });
}

// Hitung tanggal per bulan (waktu lokal server)
function countByMonth(dates: (Date | null)[], months: ReturnType<typeof lastMonths>) {
  const counts = new Map(months.map((m) => [m.key, 0]));
  for (const d of dates) {
    if (!d) continue;
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return months.map((m) => counts.get(m.key)!);
}

type Period = { tahun: number; bulan: number; minggu: number };

// Nomor urut minggu (4 minggu per bulan, sama dengan tabel jadwal) untuk menghitung selisih minggu
const weekIndex = (p: Period) => (p.tahun * 12 + (p.bulan - 1)) * 4 + (p.minggu - 1);

// Periode N minggu setelah `p`
function addWeeks(p: Period, n: number): Period {
  const idx = weekIndex(p) + n;
  const monthIdx = Math.floor(idx / 4);
  return { tahun: Math.floor(monthIdx / 12), bulan: (monthIdx % 12) + 1, minggu: (idx % 4) + 1 };
}

// Repair request yang masih berjalan
const ACTIVE_RR = ["pending", "in_progress"] as const;

// GET /api/dashboard — ringkasan sesuai role
router.get("/", async (req, res) => {
  const { role, id: userId, subcontId } = req.user!;
  const now = new Date();
  const months = lastMonths(now);
  const since = new Date(months[0].tahun, months[0].bulan - 1, 1);

  // ===== Subcont: hanya perbaikan perusahaannya =====
  if (role === ROLES.SUBCONT) {
    const rows = subcontId
      ? await prisma.outhouseRepair.groupBy({ by: ["status"], where: { subcontId }, _count: { _all: true } })
      : [];
    return res.json({
      view: "subcont",
      outhouse: Object.fromEntries(rows.map((r) => [r.status, r._count._all])),
    });
  }

  // ===== Ast. Leader: laporan kerusakan miliknya & mesin PIC-nya =====
  if (role === ROLES.AST_LEADER) {
    const [rows, picMachines, requested] = await Promise.all([
      prisma.repairRequest.groupBy({ by: ["status"], where: { requestedById: userId }, _count: { _all: true } }),
      prisma.picMesin.count({ where: { userId } }),
      prisma.repairRequest.findMany({
        where: { requestedById: userId, requestedAt: { gte: since } },
        select: { requestedAt: true },
      }),
    ]);
    return res.json({
      view: "leader",
      repairRequests: Object.fromEntries(rows.map((r) => [r.status, r._count._all])),
      picMachines,
      monthly: { months, repairRequests: countByMonth(requested.map((r) => r.requestedAt), months) },
    });
  }

  // ===== Super Admin & mekanik: ringkasan operasional (mengikuti dashboard SIMFATI v1) =====
  // Jadwal v2 per minggu (W1–W4), jadi "hari ini" di v1 menjadi "minggu ini" di sini.
  const period = currentPeriod(now);
  const { tahun, bulan, minggu } = period;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const days30 = new Date(todayStart.getTime() - 29 * 86400000);
  const days90 = new Date(todayStart.getTime() - 90 * 86400000);
  const upcomingPeriods = [1, 2, 3, 4].map((n) => addWeeks(period, n));

  // Jadwal mesin (bukan aktivitas tanpa asset) yang belum ada checkup-nya
  const machinePlan = { assetId: { not: null } };
  const notStarted = { status: "planned" as const, generalCheckup: { is: null } };

  const assetSelect = {
    kode: true,
    description: true,
    category: { select: { name: true } },
    picMesin: { select: { user: { select: { name: true } } } },
  };

  const [
    weekSchedules,
    overdueSchedules,
    onProgressCount,
    monthSchedules,
    upcomingCounts,
    activeRepairs,
    completedRepairsThisMonth,
    newRepairsToday,
    waitingPart,
    assetsByStatus,
    assetsInRepair,
    lowStockItems,
    subcontItems,
    troubleRows,
    checkupDates,
    repairDates,
    recentCheckups,
  ] = await Promise.all([
    // Agenda minggu ini
    prisma.preventiveSchedule.findMany({
      where: { bulan, minggu, plan: { tahun, ...machinePlan } },
      select: {
        id: true,
        plan: { select: { asset: { select: assetSelect } } },
        generalCheckup: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            user: { select: { name: true } },
            _count: { select: { details: { where: { result: "NG" } } } },
          },
        },
      },
      orderBy: [{ plan: { urutan: "asc" } }],
    }),
    // Delay: jadwal minggu-minggu sebelumnya yang belum dikerjakan
    prisma.preventiveSchedule.findMany({
      where: {
        ...notStarted,
        OR: [
          { plan: { tahun: { lt: tahun }, ...machinePlan } },
          { plan: { tahun, ...machinePlan }, bulan: { lt: bulan } },
          { plan: { tahun, ...machinePlan }, bulan, minggu: { lt: minggu } },
        ],
      },
      select: {
        id: true,
        bulan: true,
        minggu: true,
        plan: { select: { tahun: true, asset: { select: { kode: true, description: true } } } },
      },
      orderBy: [{ plan: { tahun: "asc" } }, { bulan: "asc" }, { minggu: "asc" }],
    }),
    prisma.generalCheckup.count({ where: { status: "on_progress" } }),
    // Pencapaian PM bulan ini: jadwal bulan ini s/d minggu berjalan
    prisma.preventiveSchedule.findMany({
      where: { bulan, minggu: { lte: minggu }, plan: { tahun, ...machinePlan } },
      select: { minggu: true, generalCheckup: { select: { id: true } } },
    }),
    // Jadwal 4 minggu ke depan
    Promise.all(
      upcomingPeriods.map((p) =>
        prisma.preventiveSchedule.count({
          where: { ...notStarted, bulan: p.bulan, minggu: p.minggu, plan: { tahun: p.tahun, ...machinePlan } },
        }),
      ),
    ),
    prisma.repairRequest.findMany({
      where: { status: { in: [...ACTIVE_RR] } },
      select: {
        id: true,
        kode: true,
        problem: true,
        status: true,
        repairAction: true,
        requestedAt: true,
        asset: { select: { kode: true, description: true } },
        requestedBy: { select: { name: true } },
      },
      orderBy: { requestedAt: "asc" },
    }),
    prisma.repairRequest.findMany({
      where: { status: "completed", completedAt: { gte: monthStart } },
      select: { requestedAt: true, completedAt: true },
    }),
    prisma.repairRequest.count({ where: { requestedAt: { gte: todayStart } } }),
    // Part diminta tapi belum terpasang, untuk perbaikan yang masih berjalan
    prisma.checkupPartRequest.count({
      where: {
        installedAt: null,
        OR: [
          { repairRequest: { status: { in: [...ACTIVE_RR] } } },
          { detail: { checkup: { status: "on_progress" } } },
        ],
      },
    }),
    prisma.asset.groupBy({ by: ["status"], _count: { _all: true } }),
    // Mesin yang punya repair request aktif = sedang bermasalah
    prisma.repairRequest.findMany({
      where: { status: { in: [...ACTIVE_RR] } },
      select: { assetId: true },
      distinct: ["assetId"],
    }),
    // Sama dengan v1: hanya sparepart yang punya minimal stok, stok <= minimal
    prisma.sparepart.findMany({
      where: { minimalStok: { gt: 0 }, stok: { lte: prisma.sparepart.fields.minimalStok } },
      select: { id: true, kodeBarang: true, namaBarang: true, stok: true, minimalStok: true, uom: true },
    }),
    prisma.outhouseRepair.findMany({
      where: { status: { not: "completed" } },
      select: {
        id: true,
        problem: true,
        status: true,
        startedAt: true,
        subcont: { select: { nama: true } },
        repairRequest: { select: { id: true, asset: { select: { kode: true } } } },
        detail: { select: { checkup: { select: { id: true, asset: { select: { kode: true } } } } } },
      },
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.repairRequest.groupBy({
      by: ["assetId"],
      where: { requestedAt: { gte: days90 }, status: { not: "cancelled" } },
      _count: { _all: true },
      orderBy: { _count: { assetId: "desc" } },
      take: 5,
    }),
    prisma.generalCheckup.findMany({ where: { startedAt: { gte: since } }, select: { startedAt: true } }),
    prisma.repairRequest.findMany({ where: { requestedAt: { gte: since } }, select: { requestedAt: true } }),
    // Hasil checkup 30 hari: NG kalau ada minimal satu poin NG
    prisma.generalCheckup.findMany({
      where: { submittedAt: { gte: days30 } },
      select: { _count: { select: { details: { where: { result: "NG" } } } } },
    }),
  ]);

  const troubleAssets = await prisma.asset.findMany({
    where: { id: { in: troubleRows.map((r) => r.assetId) } },
    select: { id: true, kode: true, description: true },
  });
  const troubleAsset = new Map(troubleAssets.map((a) => [a.id, a]));

  // ----- Checkup minggu ini -----
  const agenda = weekSchedules
    .map((s) => {
      const a = s.plan.asset!;
      const c = s.generalCheckup;
      const status = !c ? "pending" : c.status === "completed" ? "completed" : "on_progress";
      return {
        scheduleId: s.id,
        checkupId: c?.id ?? null,
        kode: a.kode,
        description: a.description,
        category: a.category.name,
        pic: c?.user.name ?? (a.picMesin.map((p) => p.user.name).join(", ") || "-"),
        status,
        // Hasil hanya ada setelah checkup disubmit
        result: c?.submittedAt ? (c._count.details > 0 ? "NG" : "OK") : null,
      };
    })
    // Belum dikerjakan dulu, lalu sedang dikerjakan, lalu selesai
    .sort((a, b) => ["pending", "on_progress", "completed"].indexOf(a.status) - ["pending", "on_progress", "completed"].indexOf(b.status));

  const completedWeek = agenda.filter((r) => r.status === "completed").length;
  const inProgressWeek = agenda.filter((r) => r.status === "on_progress").length;

  const currentIdx = weekIndex(period);
  const overdue = overdueSchedules.map((s) => ({
    scheduleId: s.id,
    kode: s.plan.asset!.kode,
    description: s.plan.asset!.description,
    period: { tahun: s.plan.tahun, bulan: s.bulan, minggu: s.minggu },
    weeksLate: currentIdx - weekIndex({ tahun: s.plan.tahun, bulan: s.bulan, minggu: s.minggu }),
  }));

  const doneThisMonth = monthSchedules.filter((s) => s.generalCheckup).length;
  const missedThisMonth = monthSchedules.filter((s) => !s.generalCheckup && s.minggu < minggu).length;
  const pmDenominator = doneThisMonth + missedThisMonth;

  // ----- Repair -----
  const avgMinutes = completedRepairsThisMonth.length
    ? Math.round(
        completedRepairsThisMonth.reduce((n, r) => n + (r.completedAt!.getTime() - r.requestedAt.getTime()) / 60000, 0) /
          completedRepairsThisMonth.length,
      )
    : null;

  // ----- Mesin -----
  const statusCount = Object.fromEntries(assetsByStatus.map((r) => [r.status, r._count._all]));
  const assetTotal = assetsByStatus.reduce((n, r) => n + r._count._all, 0);

  // ----- Sparepart: paling kritis dulu (stok / minimal terkecil) -----
  const lowSorted = lowStockItems
    .map((s) => ({ ...s, id: s.id.toString(), stok: s.stok ?? 0 }))
    .sort((a, b) => a.stok / a.minimalStok! - b.stok / b.minimalStok!);

  const ngCount = recentCheckups.filter((c) => c._count.details > 0).length;

  res.json({
    view: "full",
    period,
    checkup: {
      planWeek: agenda.length,
      completedWeek,
      inProgressWeek,
      notStartedWeek: agenda.length - completedWeek - inProgressWeek,
      agenda,
      overdueCount: overdue.length,
      overdue: overdue.slice(0, 12),
      onProgressCount,
      upcoming: upcomingPeriods.map((p, i) => ({ ...p, total: upcomingCounts[i] })),
      compliancePct: pmDenominator > 0 ? Math.round((doneThisMonth / pmDenominator) * 100) : null,
      doneThisMonth,
      missedThisMonth,
    },
    repair: {
      active: activeRepairs,
      pending: activeRepairs.filter((r) => r.status === "pending").length,
      inProgress: activeRepairs.filter((r) => r.status === "in_progress").length,
      newToday: newRepairsToday,
      completedThisMonth: completedRepairsThisMonth.length,
      avgResolutionMinutes: avgMinutes,
      waitingPart,
    },
    machine: {
      total: assetTotal,
      active: statusCount.active ?? 0,
      inactive: statusCount.inactive ?? 0,
      inRepair: assetsInRepair.length,
    },
    sparepart: {
      lowCount: lowSorted.length,
      emptyCount: lowSorted.filter((s) => s.stok <= 0).length,
      lowItems: lowSorted.slice(0, 6),
    },
    subcont: {
      count: subcontItems.length,
      items: subcontItems.slice(0, 5).map((o) => ({
        id: o.id,
        subcont: o.subcont.nama,
        machine: o.repairRequest?.asset.kode ?? o.detail?.checkup.asset.kode ?? "-",
        // Halaman asal perbaikan, untuk link dari dashboard
        repairRequestId: o.repairRequest?.id ?? null,
        checkupId: o.detail?.checkup.id ?? null,
        problem: o.problem,
        status: o.status,
        startedAt: o.startedAt,
      })),
    },
    topTroubleMachines: troubleRows.map((r) => ({
      assetId: r.assetId,
      kode: troubleAsset.get(r.assetId)?.kode ?? "-",
      description: troubleAsset.get(r.assetId)?.description ?? null,
      total: r._count._all,
    })),
    trend: {
      months,
      checkups: countByMonth(checkupDates.map((c) => c.startedAt), months),
      repairRequests: countByMonth(repairDates.map((r) => r.requestedAt), months),
    },
    checkupResult: { ok: recentCheckups.length - ngCount, ng: ngCount },
  });
});

export default router;
