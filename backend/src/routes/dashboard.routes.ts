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

  // ===== Super Admin & mekanik: ringkasan lengkap =====
  const { tahun, bulan, minggu } = currentPeriod(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fields = prisma.sparepart.fields;
  // Jadwal mesin yang masih planned & belum ada checkup-nya
  const plannedWhere = { status: "planned" as const, generalCheckup: { is: null }, plan: { assetId: { not: null } } };

  const [
    dueThisWeek,
    overdue,
    inProgress,
    completedThisMonth,
    ngOpen,
    repairRows,
    stockLow,
    stockEmpty,
    assetTotal,
    assetActive,
    byCategory,
    categories,
    completedCheckups,
    requested,
  ] = await Promise.all([
    prisma.preventiveSchedule.count({ where: { ...plannedWhere, bulan, minggu, plan: { ...plannedWhere.plan, tahun } } }),
    prisma.preventiveSchedule.count({
      where: {
        ...plannedWhere,
        OR: [
          { plan: { tahun: { lt: tahun }, assetId: { not: null } } },
          { plan: { tahun, assetId: { not: null } }, bulan: { lt: bulan } },
          { plan: { tahun, assetId: { not: null } }, bulan, minggu: { lt: minggu } },
        ],
      },
    }),
    prisma.generalCheckup.count({ where: { status: "on_progress" } }),
    prisma.generalCheckup.count({ where: { status: "completed", completedAt: { gte: monthStart } } }),
    prisma.checkupDetail.count({ where: { result: "NG", ngClosedAt: null, checkup: { submittedAt: { not: null } } } }),
    prisma.repairRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    // Sama dengan status stok di halaman Sparepart: low = 0 < stok ≤ minimal, habis = kosong / 0
    prisma.sparepart.count({ where: { stok: { gt: 0, lte: fields.minimalStok } } }),
    prisma.sparepart.count({ where: { OR: [{ stok: null }, { stok: { lte: 0 } }] } }),
    prisma.asset.count(),
    prisma.asset.count({ where: { status: "active" } }),
    prisma.asset.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.kategoriAset.findMany({ select: { id: true, name: true } }),
    prisma.generalCheckup.findMany({
      where: { status: "completed", completedAt: { gte: since } },
      select: { completedAt: true },
    }),
    prisma.repairRequest.findMany({ where: { requestedAt: { gte: since } }, select: { requestedAt: true } }),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  res.json({
    view: "full",
    period: { tahun, bulan, minggu },
    checkup: { dueThisWeek, overdue, inProgress, completedThisMonth, ngOpen },
    repairRequests: Object.fromEntries(repairRows.map((r) => [r.status, r._count._all])),
    stock: { low: stockLow, empty: stockEmpty },
    assets: {
      total: assetTotal,
      active: assetActive,
      byCategory: byCategory
        .map((c) => ({ id: c.categoryId, name: categoryName.get(c.categoryId) ?? "-", total: c._count._all }))
        .sort((a, b) => b.total - a.total),
    },
    monthly: {
      months,
      checkups: countByMonth(completedCheckups.map((c) => c.completedAt), months),
      repairRequests: countByMonth(requested.map((r) => r.requestedAt), months),
    },
  });
});

export default router;
