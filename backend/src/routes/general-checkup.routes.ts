import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";
import { PHOTO_MIME_TYPES, removeUploads, savePhoto } from "../lib/uploads";
import { checkupCodePrefix, currentPeriod, currentShift, dueScheduleWhere, isDue, nextCheckupCode } from "../lib/checkup";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth";
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
import { Prisma } from "../generated/prisma/client";

const router = Router();

// General checkup dikerjakan mekanik; superadmin bisa semua (hapus checkup khusus superadmin)
router.use(requireAuth, requireRole(ROLES.SUPERADMIN, ROLES.MEKANIK));

const PHOTO_DIR = "checkup-photos";
const MAX_PHOTOS = 10;
const photoBody = express.raw({ type: PHOTO_MIME_TYPES, limit: "10mb" });

const parseId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const assetSelect = {
  id: true,
  kode: true,
  description: true,
  category: { select: { id: true, name: true } },
} as const;

// Jumlah hasil per checkup (untuk daftar): { ok, ng, pending, total, ngOpen }
async function resultCounts(checkupIds: number[]) {
  const [rows, openRows] = checkupIds.length
    ? await Promise.all([
        prisma.checkupDetail.groupBy({
          by: ["checkupId", "result"],
          where: { checkupId: { in: checkupIds } },
          _count: { _all: true },
        }),
        // NG yang belum ditutup
        prisma.checkupDetail.groupBy({
          by: ["checkupId"],
          where: { checkupId: { in: checkupIds }, result: "NG", ngClosedAt: null },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const map = new Map<number, { ok: number; ng: number; pending: number; total: number; ngOpen: number }>();
  for (const id of checkupIds) map.set(id, { ok: 0, ng: 0, pending: 0, total: 0, ngOpen: 0 });
  for (const row of openRows) map.get(row.checkupId)!.ngOpen = row._count._all;
  for (const row of rows) {
    const c = map.get(row.checkupId)!;
    const n = row._count._all;
    c.total += n;
    if (row.result === "OK") c.ok += n;
    else if (row.result === "NG") c.ng += n;
    else c.pending += n;
  }
  return map;
}

const listSelect = {
  id: true,
  kode: true,
  status: true,
  shift: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  checksheetName: true,
  asset: { select: assetSelect },
  user: { select: { id: true, name: true } },
  schedule: { select: { bulan: true, minggu: true, tipe: true, plan: { select: { tahun: true } } } },
} as const;

type ListRow = Prisma.GeneralCheckupGetPayload<{ select: typeof listSelect }>;

async function withCounts(rows: ListRow[]) {
  const counts = await resultCounts(rows.map((r) => r.id));
  return rows.map(({ schedule, ...row }) => ({
    ...row,
    schedule: schedule
      ? { tahun: schedule.plan.tahun, bulan: schedule.bulan, minggu: schedule.minggu, tipe: schedule.tipe }
      : null,
    counts: counts.get(row.id)!,
  }));
}

// GET /api/general-checkups?categoryId= — jadwal yang perlu dikerjakan + checkup yang masih berjalan
router.get("/", async (req, res) => {
  const categoryId = parseId(req.query.categoryId);
  const now = new Date();
  const period = currentPeriod(now);

  const [schedules, inProgress] = await Promise.all([
    prisma.preventiveSchedule.findMany({
      where: {
        AND: [
          dueScheduleWhere(now),
          { status: "planned", generalCheckup: { is: null } },
          // Aktivitas tanpa mesin (mis. cleaning cooling tower) tidak punya checksheet
          { plan: { assetId: { not: null }, ...(categoryId ? { categoryId } : {}) } },
        ],
      },
      select: {
        id: true,
        bulan: true,
        minggu: true,
        tipe: true,
        plan: {
          select: {
            tahun: true,
            nama: true,
            asset: {
              select: {
                ...assetSelect,
                checksheet: { select: { id: true, name: true, _count: { select: { items: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.generalCheckup.findMany({
      where: { status: "on_progress", ...(categoryId ? { asset: { categoryId } } : {}) },
      select: listSelect,
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const due = schedules
    .map((s) => {
      const asset = s.plan.asset!;
      const { checksheet, ...assetInfo } = asset;
      return {
        scheduleId: s.id,
        tahun: s.plan.tahun,
        bulan: s.bulan,
        minggu: s.minggu,
        tipe: s.tipe,
        nama: s.plan.nama,
        // Bukan minggu ini = minggunya sudah lewat
        overdue: !(s.plan.tahun === period.tahun && s.bulan === period.bulan && s.minggu === period.minggu),
        asset: assetInfo,
        checksheet: checksheet ? { id: checksheet.id, name: checksheet.name, itemCount: checksheet._count.items } : null,
      };
    })
    // Terlama dulu, lalu urut kode mesin
    .sort((a, b) => a.tahun - b.tahun || a.bulan - b.bulan || a.minggu - b.minggu || a.asset.kode.localeCompare(b.asset.kode));

  res.json({ period, due, inProgress: await withCounts(inProgress) });
});

// GET /api/general-checkups/history?search=&categoryId=&status=&page=1 — semua checkup
router.get("/history", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const categoryId = parseId(req.query.categoryId);
  const status = req.query.status === "on_progress" || req.query.status === "completed" ? req.query.status : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where: Prisma.GeneralCheckupWhereInput = {
    ...(status ? { status } : {}),
    ...(categoryId ? { asset: { categoryId } } : {}),
    ...(search
      ? {
          OR: [
            { kode: { contains: search } },
            { asset: { kode: { contains: search } } },
            { asset: { description: { contains: search } } },
            { user: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.generalCheckup.findMany({
      where,
      select: listSelect,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.generalCheckup.count({ where }),
  ]);

  res.json({ data: await withCounts(rows), total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) });
});

const detailSelect = {
  id: true,
  urutan: true,
  bagian: true,
  poin: true,
  metode: true,
  standar: true,
  result: true,
  notes: true,
  ngClosedAt: true,
  ...repairDataSelect,
} as const;

const detailToJson = repairDataToJson;

// GET /api/general-checkups/options — pilihan untuk form penanganan NG
router.get("/options", async (_req, res) => {
  const subconts = await prisma.subcont.findMany({
    where: { status: "active" },
    select: { id: true, nama: true },
    orderBy: { nama: "asc" },
  });
  res.json({ subconts });
});

// GET /api/general-checkups/:id — detail checkup beserta semua poin & foto
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const checkup = id
    ? await prisma.generalCheckup.findUnique({
        where: { id },
        select: {
          ...listSelect,
          notes: true,
          details: { select: detailSelect, orderBy: { urutan: "asc" } },
          photos: { select: { id: true, path: true, createdAt: true }, orderBy: { id: "asc" } },
        },
      })
    : null;
  if (!checkup) return res.status(404).json({ message: "Checkup tidak ditemukan" });

  const [row] = await withCounts([checkup]);
  res.json({ ...row, notes: checkup.notes, details: checkup.details.map(detailToJson), photos: checkup.photos });
});

const startSchema = z.object({
  scheduleId: z.coerce.number({ error: "Jadwal tidak valid" }).int().positive("Jadwal tidak valid"),
});

// POST /api/general-checkups/start { scheduleId } — mulai checkup dari jadwal preventive.
// Poin checksheet mesin disalin dengan hasil PENDING, jadwal menjadi in progress.
router.post("/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Jadwal tidak valid" });

  const schedule = await prisma.preventiveSchedule.findUnique({
    where: { id: parsed.data.scheduleId },
    select: {
      id: true,
      bulan: true,
      minggu: true,
      status: true,
      generalCheckup: { select: { id: true } },
      plan: {
        select: {
          tahun: true,
          asset: {
            select: {
              id: true,
              kode: true,
              category: { select: { name: true } },
              checksheet: {
                select: {
                  name: true,
                  items: {
                    select: { urutan: true, bagian: true, poin: true, metode: true, standar: true },
                    orderBy: { urutan: "asc" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!schedule) return res.status(404).json({ message: "Jadwal tidak ditemukan" });

  // Sudah pernah dimulai (mis. klik dua kali / dibuka user lain) -> lanjutkan checkup yang ada
  if (schedule.generalCheckup) {
    return res.json({ id: schedule.generalCheckup.id, message: "Checkup sudah dimulai sebelumnya" });
  }
  if (schedule.status !== "planned") {
    return res.status(400).json({ message: "Jadwal ini sudah berjalan atau selesai" });
  }
  if (!isDue({ tahun: schedule.plan.tahun, bulan: schedule.bulan, minggu: schedule.minggu })) {
    return res.status(400).json({ message: "Jadwal ini belum waktunya dikerjakan" });
  }

  const asset = schedule.plan.asset;
  if (!asset) return res.status(400).json({ message: "Jadwal ini tidak terhubung ke mesin" });
  if (!asset.checksheet || asset.checksheet.items.length === 0) {
    return res.status(400).json({
      message: `Mesin ${asset.kode} belum punya checksheet. Atur checksheet di halaman Data Asset terlebih dahulu.`,
    });
  }
  const checksheet = asset.checksheet;
  const prefix = checkupCodePrefix(asset.category.name);
  const now = new Date();

  // Nomor checkup bisa bentrok kalau dua orang mulai bersamaan -> coba ulang dengan nomor berikutnya
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const checkup = await prisma.$transaction(async (tx) => {
        // Kunci jadwal: hanya berhasil kalau statusnya masih planned
        const locked = await tx.preventiveSchedule.updateMany({
          where: { id: schedule.id, status: "planned" },
          data: { status: "in_progress", startedAt: now, completedAt: null },
        });
        if (locked.count === 0) throw new ScheduleTakenError();

        const last = await tx.generalCheckup.findFirst({
          where: { kode: { startsWith: prefix } },
          select: { kode: true },
          orderBy: { id: "desc" },
        });

        return tx.generalCheckup.create({
          data: {
            kode: nextCheckupCode(prefix, last?.kode ?? null),
            scheduleId: schedule.id,
            assetId: asset.id,
            checksheetName: checksheet.name,
            userId: req.user!.id,
            shift: currentShift(now),
            startedAt: now,
            details: { create: checksheet.items },
          },
          select: { id: true, kode: true },
        });
      });

      return res.status(201).json({ ...checkup, message: `Checkup ${checkup.kode} dimulai` });
    } catch (err) {
      if (err instanceof ScheduleTakenError) {
        const existing = await prisma.generalCheckup.findUnique({ where: { scheduleId: schedule.id }, select: { id: true } });
        if (existing) return res.json({ id: existing.id, message: "Checkup sudah dimulai sebelumnya" });
        return res.status(400).json({ message: "Jadwal ini sudah berjalan atau selesai" });
      }
      const isDuplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isDuplicate) throw err;
    }
  }
  res.status(409).json({ message: "Gagal membuat nomor checkup, silakan coba lagi" });
});

class ScheduleTakenError extends Error {}

const saveSchema = z.object({
  notes: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null),
  details: z
    .array(
      z.object({
        id: z.number().int().positive(),
        result: z.enum(["PENDING", "OK", "NG"], { error: "Hasil tidak valid" }),
        notes: z
          .string()
          .trim()
          .nullish()
          .transform((value) => value || null),
      }),
    )
    .default([]),
  // false = simpan sementara (draft), true = selesai & kunci hasil
  submit: z.boolean().default(false),
});

// PUT /api/general-checkups/:id — simpan hasil checkup (draft atau submit)
router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const checkup = id
    ? await prisma.generalCheckup.findUnique({
        where: { id },
        select: { id: true, status: true, submittedAt: true, scheduleId: true, details: { select: { id: true, result: true, notes: true } } },
      })
    : null;
  if (!checkup) return res.status(404).json({ message: "Checkup tidak ditemukan" });
  if (checkup.submittedAt) return res.status(400).json({ message: "Hasil checkup sudah disubmit dan tidak bisa diubah" });

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ message: "Data tidak valid", errors: z.flattenError(parsed.error).fieldErrors });
  }
  const { notes, details, submit } = parsed.data;

  // Gabungkan input dengan data yang ada (poin yang tidak dikirim tetap seperti sebelumnya)
  const existing = new Map(checkup.details.map((d) => [d.id, d]));
  for (const d of details) {
    if (!existing.has(d.id)) return res.status(422).json({ message: "Ada poin yang bukan milik checkup ini" });
  }
  const merged = new Map(checkup.details.map((d) => [d.id, { result: d.result, notes: d.notes }]));
  for (const d of details) merged.set(d.id, { result: d.result, notes: d.notes });

  if (submit) {
    const errors: Record<string, string[]> = {};
    let pending = 0;
    for (const [detailId, d] of merged) {
      if (d.result === "PENDING") pending++;
      else if (d.result === "NG" && !d.notes) errors[`details.${detailId}`] = ["Keterangan wajib diisi untuk hasil NG"];
    }
    if (pending > 0) {
      return res.status(422).json({ message: `Masih ada ${pending} poin yang belum diisi OK / NG`, errors });
    }
    if (Object.keys(errors).length > 0) {
      return res.status(422).json({ message: "Isi keterangan untuk setiap poin NG", errors });
    }
  }

  const hasNG = [...merged.values()].some((d) => d.result === "NG");
  const now = new Date();
  // Semua OK -> selesai. Ada NG -> tetap on progress sampai NG ditangani (tahap berikutnya)
  const completed = submit && !hasNG;

  await prisma.$transaction(async (tx) => {
    for (const d of details) {
      const old = existing.get(d.id)!;
      if (old.result !== d.result || old.notes !== d.notes) {
        await tx.checkupDetail.update({ where: { id: d.id }, data: { result: d.result, notes: d.notes } });
      }
    }
    await tx.generalCheckup.update({
      where: { id: checkup.id },
      data: {
        notes,
        ...(submit ? { submittedAt: now } : {}),
        ...(completed ? { status: "completed", completedAt: now } : {}),
      },
    });
    if (completed && checkup.scheduleId) {
      await tx.preventiveSchedule.update({ where: { id: checkup.scheduleId }, data: { status: "done", completedAt: now } });
    }
  });

  res.json({
    message: !submit
      ? "Checkup disimpan sementara"
      : completed
        ? "Checkup selesai, semua poin OK"
        : "Checkup disubmit. Masih ada poin NG yang perlu ditangani",
    status: completed ? "completed" : "on_progress",
  });
});

// DELETE /api/general-checkups/:id — hapus checkup, jadwal kembali ke status terjadwal (khusus superadmin)
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const checkup = id
    ? await prisma.generalCheckup.findUnique({ where: { id }, select: { id: true, kode: true, scheduleId: true, photos: { select: { path: true } } } })
    : null;
  if (!checkup) return res.status(404).json({ message: "Checkup tidak ditemukan" });

  // Stok part yang sudah terpasang sudah berkurang & subcont sudah bekerja -> riwayat harus tetap ada
  if (await hasRepairProgress({ detail: { checkupId: checkup.id } })) {
    return res.status(400).json({
      message: "Checkup ini sudah punya part terpasang atau perbaikan subcont yang berjalan, tidak bisa dihapus",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.generalCheckup.delete({ where: { id: checkup.id } });
    if (checkup.scheduleId) {
      await tx.preventiveSchedule.update({
        where: { id: checkup.scheduleId },
        data: { status: "planned", startedAt: null, completedAt: null },
      });
    }
  });

  // File foto dihapus setelah data terhapus; file yang gagal dihapus tidak menggagalkan proses
  await removeUploads(checkup.photos.map((p) => p.path));

  res.json({ message: `Checkup ${checkup.kode} berhasil dihapus` });
});

// POST /api/general-checkups/:id/photos — upload satu foto (body = file gambar mentah)
router.post("/:id/photos", photoBody, async (req, res) => {
  const id = parseId(req.params.id);
  const checkup = id
    ? await prisma.generalCheckup.findUnique({ where: { id }, select: { id: true, status: true, _count: { select: { photos: true } } } })
    : null;
  if (!checkup) return res.status(404).json({ message: "Checkup tidak ditemukan" });
  if (checkup.status === "completed") return res.status(400).json({ message: "Checkup sudah selesai" });
  if (checkup._count.photos >= MAX_PHOTOS) return res.status(400).json({ message: `Maksimal ${MAX_PHOTOS} foto per checkup` });

  const relative = await savePhoto(PHOTO_DIR, req.body, req.headers["content-type"]);
  if (!relative) return res.status(422).json({ message: "File harus berupa gambar JPG, PNG, atau WEBP" });

  const photo = await prisma.checkupPhoto.create({
    data: { checkupId: checkup.id, path: relative },
    select: { id: true, path: true, createdAt: true },
  });
  res.status(201).json(photo);
});

// DELETE /api/general-checkups/:id/photos/:photoId
router.delete("/:id/photos/:photoId", async (req, res) => {
  const photo = await prisma.checkupPhoto.findFirst({
    where: { id: parseId(req.params.photoId) ?? 0, checkupId: parseId(req.params.id) ?? 0 },
    select: { id: true, path: true, checkup: { select: { status: true } } },
  });
  if (!photo) return res.status(404).json({ message: "Foto tidak ditemukan" });
  if (photo.checkup.status === "completed") return res.status(400).json({ message: "Checkup sudah selesai" });

  await prisma.checkupPhoto.delete({ where: { id: photo.id } });
  await removeUploads([photo.path]);
  res.json({ message: "Foto dihapus" });
});

// ===== Penanganan NG (setelah hasil checkup disubmit) =====
// Aturan tindakan (pilih, pasang part, batal part, syarat tutup) ada di lib/repair-actions.ts,
// dipakai bersama dengan repair request.

// Ambil poin NG yang masih boleh ditangani; lempar HttpError kalau tidak valid
async function findOpenNgDetail(checkupIdParam: unknown, detailIdParam: unknown) {
  const detail = await prisma.checkupDetail.findFirst({
    where: { id: parseId(detailIdParam) ?? 0, checkupId: parseId(checkupIdParam) ?? 0 },
    include: { ...repairStateInclude, checkup: { select: { submittedAt: true } } },
  });
  if (!detail) throw new HttpError(404, "Poin checkup tidak ditemukan");
  if (!detail.checkup.submittedAt) throw new HttpError(400, "Submit hasil checkup terlebih dahulu sebelum menangani NG");
  if (detail.result !== "NG") throw new HttpError(400, "Poin ini bukan NG");
  if (detail.ngClosedAt) throw new HttpError(400, "NG pada poin ini sudah ditutup");
  return detail;
}

// Checkup selesai otomatis kalau sudah disubmit dan semua NG sudah ditutup
async function completeIfAllClosed(tx: Prisma.TransactionClient, checkupId: number, now: Date) {
  const open = await tx.checkupDetail.count({ where: { checkupId, result: "NG", ngClosedAt: null } });
  if (open > 0) return false;

  const checkup = await tx.generalCheckup.update({
    where: { id: checkupId },
    data: { status: "completed", completedAt: now },
    select: { scheduleId: true },
  });
  if (checkup.scheduleId) {
    await tx.preventiveSchedule.update({ where: { id: checkup.scheduleId }, data: { status: "done", completedAt: now } });
  }
  return true;
}

// POST /api/general-checkups/:id/details/:detailId/action — pilih / ubah tindakan penanganan NG
router.post(
  "/:id/details/:detailId/action",
  handle(async (req, res) => {
    const detail = await findOpenNgDetail(req.params.id, req.params.detailId);
    const input = parseAction(req.body);
    const message = await applyAction({ detailId: detail.id }, detail, input, req.user!.id, (tx, action) =>
      tx.checkupDetail.update({ where: { id: detail.id }, data: { repairAction: action } }),
    );
    res.json({ message });
  }),
);

// POST /api/general-checkups/:id/details/:detailId/parts/:partId/install — tandai part terpasang & kurangi stok
router.post(
  "/:id/details/:detailId/parts/:partId/install",
  handle(async (req, res) => {
    const detail = await findOpenNgDetail(req.params.id, req.params.detailId);
    res.json({ message: await installPart({ detailId: detail.id }, req.params.partId) });
  }),
);

// DELETE /api/general-checkups/:id/details/:detailId/parts/:partId — batalkan permintaan part yang belum terpasang
router.delete(
  "/:id/details/:detailId/parts/:partId",
  handle(async (req, res) => {
    const detail = await findOpenNgDetail(req.params.id, req.params.detailId);
    const message = await cancelPart({ detailId: detail.id }, req.params.partId, (tx) =>
      tx.checkupDetail.update({ where: { id: detail.id }, data: { repairAction: null } }),
    );
    res.json({ message });
  }),
);

// POST /api/general-checkups/:id/details/:detailId/close — tutup NG setelah tindakannya selesai
router.post(
  "/:id/details/:detailId/close",
  handle(async (req, res) => {
    const detail = await findOpenNgDetail(req.params.id, req.params.detailId);
    const blocker = closeBlocker(detail);
    if (blocker) throw new HttpError(400, blocker);

    const now = new Date();
    const completed = await prisma.$transaction(async (tx) => {
      await confirmOuthouseOnClose(tx, { detailId: detail.id }, detail, now);
      await tx.checkupDetail.update({ where: { id: detail.id }, data: { ngClosedAt: now } });
      return completeIfAllClosed(tx, detail.checkupId, now);
    });

    res.json({
      message: completed ? "NG ditutup. Semua NG sudah ditangani, checkup selesai" : "NG ditutup",
      checkupCompleted: completed,
    });
  }),
);

export default router;
