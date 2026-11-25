import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { parseScheduleWorkbook, type ParsedPlanRow } from "../lib/schedule-excel";

const router = Router();

// Semua route wajib login; import, tambah/ubah/hapus baris & ubah status khusus admin
router.use(requireAuth);

// File Excel dikirim mentah (application/octet-stream), bukan multipart
const excelBody = express.raw({ type: "application/octet-stream", limit: "20mb" });

type Scope = { scheduleCategoryId: number; categoryId: number };

// Kategori schedule = halaman (submenu Schedule) tempat jadwal tampil.
// Kategori aset-nya diambil dari kategori schedule (jembatan kategori schedule -> asset), bukan dipilih user.
async function findScope(query: Record<string, unknown>) {
  const id = Number(query.scheduleCategoryId);
  if (!Number.isInteger(id) || id <= 0) return { error: "Kategori schedule tidak ditemukan" } as const;

  const found = await prisma.scheduleCategory.findUnique({
    where: { id },
    select: { id: true, name: true, kategoriAset: { select: { id: true, name: true } } },
  });
  if (!found) return { error: "Kategori schedule tidak ditemukan" } as const;

  const { kategoriAset: category, ...scheduleCategory } = found;
  const scope: Scope = { scheduleCategoryId: scheduleCategory.id, categoryId: category.id };
  return { scheduleCategory, category, scope } as const;
}

// Kode mesin untuk dicocokkan ke asset: tanpa spasi/titik, huruf besar.
// "PT.68 (PT.22)" -> kode utama "PT68"; "HC.01 MITSUBISHI 5T" -> kata pertama "HC01"
const kodeKey = (s: string) => s.toUpperCase().replace(/[\s.]/g, "");

function candidateKeys(nama: string) {
  const beforeBracket = nama.split("(")[0].trim();
  const firstWord = beforeBracket.split(/\s+/)[0] ?? "";
  return [...new Set([nama, beforeBracket, firstWord].map(kodeKey).filter(Boolean))];
}

type PreviewRow = ParsedPlanRow & { asset: { id: number; kode: string } | null };

async function buildPreview(body: unknown, scope: Scope) {
  const { categoryId } = scope;
  if (!Buffer.isBuffer(body) || body.length === 0) return { error: "File Excel wajib diupload" } as const;

  let parsed: Awaited<ReturnType<typeof parseScheduleWorkbook>>;
  try {
    parsed = await parseScheduleWorkbook(body);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan formatnya .xlsx" } as const;
  }
  if ("error" in parsed) return { error: parsed.error } as const;

  // Cocokkan nama/kode mesin dengan asset di kategori yang sama
  const assets = await prisma.asset.findMany({ where: { categoryId }, select: { id: true, kode: true } });
  const assetByKey = new Map(assets.map((a) => [kodeKey(a.kode), a]));

  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const key = candidateKeys(row.nama).find((k) => assetByKey.has(k));
    return { ...row, asset: key ? assetByKey.get(key)! : null };
  });

  const errors: string[] = [];
  if (parsed.tahun === null) errors.push('Tahun tidak ditemukan di file. Pastikan ada tulisan "TAHUN : 2026"');
  if (rows.length === 0) errors.push("Tidak ada baris mesin/aktivitas di tabel jadwal");

  // Jadwal yang sudah ada untuk kategori schedule, kategori aset & tahun ini akan diganti,
  // kecuali sudah ada yang berjalan
  let existing = { plans: 0, schedules: 0, progress: 0 };
  if (parsed.tahun !== null) {
    const planWhere = { ...scope, tahun: parsed.tahun };
    const where = { plan: planWhere };
    const [plans, schedules, progress] = await Promise.all([
      prisma.preventivePlan.count({ where: planWhere }),
      prisma.preventiveSchedule.count({ where }),
      prisma.preventiveSchedule.count({ where: { ...where, status: { not: "planned" } } }),
    ]);
    existing = { plans, schedules, progress };
    if (progress > 0) {
      errors.push(
        `Jadwal ${parsed.tahun} kategori ini sudah berjalan (${progress} jadwal in progress/selesai), tidak bisa ditimpa lewat import`,
      );
    }
  }

  return {
    sheet: parsed.sheet,
    tahun: parsed.tahun,
    rows,
    warnings: parsed.warnings,
    errors,
    existing,
    summary: {
      rows: rows.length,
      schedules: rows.reduce((n, r) => n + r.schedules.length, 0),
      matched: rows.filter((r) => r.asset).length,
      unmatched: rows.filter((r) => !r.asset).length,
    },
    valid: errors.length === 0,
  } as const;
}

const scheduleSelect = {
  id: true,
  bulan: true,
  minggu: true,
  tipe: true,
  status: true,
  startedAt: true,
  completedAt: true,
} as const;

const scheduleOrder: { bulan?: "asc"; minggu?: "asc" }[] = [{ bulan: "asc" }, { minggu: "asc" }];

const planSelect = {
  id: true,
  urutan: true,
  grup: true,
  nama: true,
  deskripsi: true,
  asset: { select: { id: true, kode: true, checksheet: { select: { id: true, name: true } } } },
  // Jadwal dibuat berurutan per bulan & minggu saat import, jadi urut id = urut waktu
  schedules: { select: scheduleSelect, orderBy: scheduleOrder },
} as const;

// GET /api/preventive-schedules/years?scheduleCategoryId=1 — tahun yang sudah punya jadwal
router.get("/years", async (req, res) => {
  const scheduleCategoryId = Number(req.query.scheduleCategoryId) || undefined;
  const rows = await prisma.preventivePlan.findMany({
    where: scheduleCategoryId ? { scheduleCategoryId } : {},
    select: { tahun: true },
    distinct: ["tahun"],
    orderBy: { tahun: "desc" },
  });
  res.json(rows.map((r) => r.tahun));
});

// GET /api/preventive-schedules?scheduleCategoryId=1&tahun=2026
// — tabel jadwal satu kategori schedule (asset dari kategori aset-nya), satu tahun
router.get("/", async (req, res) => {
  const found = await findScope(req.query);
  if ("error" in found) return res.status(404).json({ message: found.error });
  const tahun = Number(req.query.tahun);
  if (!Number.isInteger(tahun)) return res.status(422).json({ message: "Tahun wajib diisi" });

  const plans = await prisma.preventivePlan.findMany({
    where: { ...found.scope, tahun },
    select: planSelect,
    orderBy: { urutan: "asc" },
  });

  res.json({ scheduleCategory: found.scheduleCategory, category: found.category, tahun, plans });
});

// POST /api/preventive-schedules/import/preview?scheduleCategoryId=1 — baca file tanpa menyimpan
router.post("/import/preview", requireAdmin, excelBody, async (req, res) => {
  const found = await findScope(req.query);
  if ("error" in found) return res.status(422).json({ message: found.error });

  const result = await buildPreview(req.body, found.scope);
  if ("error" in result) return res.status(422).json({ message: result.error });
  res.json(result);
});

// POST /api/preventive-schedules/import?scheduleCategoryId=1
// — ganti jadwal kategori schedule & tahun tsb dengan isi file
router.post("/import", requireAdmin, excelBody, async (req, res) => {
  const found = await findScope(req.query);
  if ("error" in found) return res.status(422).json({ message: found.error });
  const { scheduleCategory, category, scope } = found;

  const result = await buildPreview(req.body, scope);
  if ("error" in result) return res.status(422).json({ message: result.error });
  if (!result.valid) return res.status(422).json({ message: result.errors[0] });

  const tahun = result.tahun!;

  await prisma.$transaction(
    async (tx) => {
      // Jadwal lama masih "planned" semua (dicek di preview), aman diganti
      await tx.preventivePlan.deleteMany({ where: { ...scope, tahun } });
      for (const [i, row] of result.rows.entries()) {
        await tx.preventivePlan.create({
          data: {
            ...scope,
            tahun,
            urutan: i + 1,
            grup: row.grup,
            nama: row.nama.slice(0, 255),
            deskripsi: row.deskripsi?.slice(0, 255) ?? null,
            assetId: row.asset?.id ?? null,
            schedules: { create: row.schedules },
          },
        });
      }
    },
    { timeout: 120_000 },
  );

  res.status(201).json({
    message: `Jadwal ${scheduleCategory.name} (${category.name}) ${tahun} tersimpan: ${result.summary.rows} baris, ${result.summary.schedules} jadwal`,
    ...result.summary,
  });
});

const statusSchema = z.object({
  status: z.enum(["planned", "in_progress", "done"], { error: "Status tidak valid" }),
});

// PATCH /api/preventive-schedules/schedules/:id — ubah status satu jadwal (sementara manual,
// nantinya otomatis dari pengisian checksheet preventive)
router.patch("/schedules/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ message: "Data tidak valid", errors: z.flattenError(parsed.error).fieldErrors });
  }

  const schedule = await prisma.preventiveSchedule.findUnique({
    where: { id },
    include: { generalCheckup: { select: { kode: true } } },
  });
  if (!schedule) return res.status(404).json({ message: "Jadwal tidak ditemukan" });
  // Jadwal yang sudah punya general checkup: statusnya mengikuti checkup, tidak boleh diubah manual
  if (schedule.generalCheckup) {
    return res.status(400).json({
      message: `Status jadwal ini diatur otomatis oleh General Checkup ${schedule.generalCheckup.kode}`,
    });
  }

  const { status } = parsed.data;
  const now = new Date();
  const updated = await prisma.preventiveSchedule.update({
    where: { id },
    data: {
      status,
      // Catat kapan mulai & selesai; kembali ke planned = waktu dikosongkan
      startedAt: status === "planned" ? null : (schedule.startedAt ?? now),
      completedAt: status === "done" ? (schedule.completedAt ?? now) : null,
    },
    select: scheduleSelect,
  });

  res.json(updated);
});

// ===== CRUD baris jadwal (selain lewat import Excel) =====
// Baris dari form selalu berupa asset; nama & deskripsi baris diambil dari data asset

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const scheduleItemSchema = z.object({
  bulan: z.number().int().min(1).max(12),
  minggu: z.number().int().min(1).max(4),
  tipe: z.enum(["periodic", "yearly"]),
});

const schedulesSchema = z.array(scheduleItemSchema).min(1, "Pilih minimal satu minggu jadwal");

const createPlanSchema = z.object({
  scheduleCategoryId: z.number().int().positive(),
  tahun: z.number({ error: "Tahun wajib diisi" }).int().min(2000).max(2100),
  assetId: z.number({ error: "Asset wajib dipilih" }).int().positive("Asset wajib dipilih"),
  schedules: schedulesSchema,
});

// Edit: assetId boleh null hanya untuk baris hasil import yang memang tanpa asset (aktivitas)
const updatePlanSchema = z.object({
  assetId: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => v ?? null),
  schedules: schedulesSchema,
});

type ScheduleItem = z.infer<typeof scheduleItemSchema>;

const scheduleKey = (s: ScheduleItem) => `${s.bulan}-${s.minggu}-${s.tipe}`;

// Buang jadwal ganda & urutkan per bulan/minggu
function uniqueSchedules(list: ScheduleItem[]) {
  const map = new Map(list.map((s) => [scheduleKey(s), s]));
  return [...map.values()].sort((a, b) => a.bulan - b.bulan || a.minggu - b.minggu || a.tipe.localeCompare(b.tipe));
}

const invalid = (errors: Record<string, string[]>) => ({ message: "Data tidak valid", errors });

// Asset harus dari kategori aset jadwalnya & belum ada di jadwal yang sama (kategori schedule + tahun)
async function findAsset(assetId: number, where: Scope & { tahun: number }, excludePlanId?: number) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, kode: true, description: true, categoryId: true },
  });
  if (!asset || asset.categoryId !== where.categoryId) {
    return { error: invalid({ assetId: ["Asset tidak ditemukan di kategori ini"] }) } as const;
  }

  const used = await prisma.preventivePlan.findFirst({
    where: { ...where, assetId, ...(excludePlanId ? { id: { not: excludePlanId } } : {}) },
    select: { id: true },
  });
  if (used) return { error: invalid({ assetId: [`${asset.kode} sudah ada di jadwal tahun ${where.tahun}`] }) } as const;

  return { asset } as const;
}

// Nama & deskripsi baris mengikuti asset
const assetFields = (asset: { id: number; kode: string; description: string | null }) => ({
  assetId: asset.id,
  nama: asset.kode.slice(0, 255),
  deskripsi: asset.description?.slice(0, 255) || null,
});

// Jadwal yang sudah berjalan (in progress / selesai / sudah punya general checkup) tidak boleh dihapus
const isLocked = (s: { status: string; generalCheckup: { id: number } | null }) =>
  s.status !== "planned" || s.generalCheckup !== null;

const planWithSchedules = {
  schedules: { include: { generalCheckup: { select: { id: true } } } },
} as const;

// GET /api/preventive-schedules/options/assets?scheduleCategoryId=1 — pilihan asset untuk form baris jadwal:
// hanya asset dari kategori aset yang terhubung ke kategori schedule tsb
router.get("/options/assets", async (req, res) => {
  const found = await findScope(req.query);
  if ("error" in found) return res.json([]);
  const assets = await prisma.asset.findMany({
    where: { categoryId: found.category.id },
    select: { id: true, kode: true, description: true },
    orderBy: { kode: "asc" },
  });
  res.json(assets);
});

// POST /api/preventive-schedules/plans — tambah satu asset beserta jadwalnya (ditaruh paling bawah)
router.post("/plans", requireAdmin, async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(invalid(z.flattenError(parsed.error).fieldErrors));
  const data = parsed.data;

  const found = await findScope(data);
  if ("error" in found) return res.status(422).json({ message: found.error });

  const where = { ...found.scope, tahun: data.tahun };
  const result = await findAsset(data.assetId, where);
  if ("error" in result) return res.status(422).json(result.error);

  const plan = await prisma.$transaction(async (tx) => {
    const last = await tx.preventivePlan.findFirst({ where, orderBy: { urutan: "desc" } });
    return tx.preventivePlan.create({
      data: {
        ...where,
        urutan: (last?.urutan ?? 0) + 1,
        ...assetFields(result.asset),
        schedules: { create: uniqueSchedules(data.schedules) },
      },
      select: planSelect,
    });
  });

  res.status(201).json(plan);
});

// PUT /api/preventive-schedules/plans/:id — ganti asset / jadwal satu baris
// (jadwal yang sudah berjalan tetap dipertahankan, tidak bisa dihapus dari sini)
router.put("/plans/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json(invalid(z.flattenError(parsed.error).fieldErrors));
  const data = parsed.data;

  const plan = await prisma.preventivePlan.findUnique({ where: { id }, include: planWithSchedules });
  if (!plan) return res.status(404).json({ message: "Baris jadwal tidak ditemukan" });

  // Asset: baris yang sudah punya asset wajib tetap punya asset; baris aktivitas (tanpa asset) boleh tetap kosong
  let fields = {};
  if (data.assetId !== null) {
    const where = { scheduleCategoryId: plan.scheduleCategoryId, categoryId: plan.categoryId, tahun: plan.tahun };
    const result = await findAsset(data.assetId, where, plan.id);
    if ("error" in result) return res.status(422).json(result.error);
    fields = assetFields(result.asset);
  } else if (plan.assetId !== null) {
    return res.status(422).json(invalid({ assetId: ["Asset wajib dipilih"] }));
  }

  const wanted = uniqueSchedules(data.schedules);
  const wantedKeys = new Set(wanted.map(scheduleKey));
  const removed = plan.schedules.filter((s) => !wantedKeys.has(scheduleKey(s)));

  const lockedRemoved = removed.filter(isLocked);
  if (lockedRemoved.length > 0) {
    const list = lockedRemoved.map((s) => `${BULAN[s.bulan - 1]} W${s.minggu}`).join(", ");
    return res.status(422).json(invalid({ schedules: [`Jadwal ${list} sudah berjalan, tidak bisa dihapus`] }));
  }

  const existingKeys = new Set(plan.schedules.map(scheduleKey));
  const added = wanted.filter((s) => !existingKeys.has(scheduleKey(s)));

  const updated = await prisma.$transaction(async (tx) => {
    if (removed.length > 0) {
      await tx.preventiveSchedule.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
    }
    return tx.preventivePlan.update({
      where: { id },
      data: { ...fields, schedules: { create: added } },
      select: planSelect,
    });
  });

  res.json(updated);
});

// DELETE /api/preventive-schedules/plans/:id — hapus satu baris (ditolak kalau ada jadwal yang sudah berjalan)
router.delete("/plans/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const plan = await prisma.preventivePlan.findUnique({ where: { id }, include: planWithSchedules });
  if (!plan) return res.status(404).json({ message: "Baris jadwal tidak ditemukan" });

  const locked = plan.schedules.filter(isLocked).length;
  if (locked > 0) {
    return res
      .status(400)
      .json({ message: `${plan.nama} punya ${locked} jadwal yang sudah berjalan, tidak bisa dihapus` });
  }

  await prisma.preventivePlan.delete({ where: { id } });
  res.json({ message: `${plan.nama} berhasil dihapus` });
});

export default router;
