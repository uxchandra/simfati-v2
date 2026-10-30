import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { parseScheduleWorkbook, type ParsedPlanRow } from "../lib/schedule-excel";

const router = Router();

// Semua route wajib login; import, ubah status & hapus khusus admin
router.use(requireAuth);

// File Excel dikirim mentah (application/octet-stream), bukan multipart
const excelBody = express.raw({ type: "application/octet-stream", limit: "20mb" });

function findCategory(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.kategoriAset.findUnique({ where: { id }, select: { id: true, name: true } });
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

async function buildPreview(body: unknown, categoryId: number) {
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

  // Jadwal yang sudah ada untuk kategori & tahun ini akan diganti, kecuali sudah ada yang berjalan
  let existing = { plans: 0, schedules: 0, progress: 0 };
  if (parsed.tahun !== null) {
    const where = { plan: { categoryId, tahun: parsed.tahun } };
    const [plans, schedules, progress] = await Promise.all([
      prisma.preventivePlan.count({ where: { categoryId, tahun: parsed.tahun } }),
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

const planSelect = {
  id: true,
  urutan: true,
  grup: true,
  nama: true,
  deskripsi: true,
  asset: { select: { id: true, kode: true, checksheet: { select: { id: true, name: true } } } },
  // Jadwal dibuat berurutan per bulan & minggu saat import, jadi urut id = urut waktu
  schedules: { select: scheduleSelect, orderBy: { id: "asc" } },
} as const;

// GET /api/preventive-schedules/years?categoryId=1 — tahun yang sudah punya jadwal
router.get("/years", async (req, res) => {
  const categoryId = Number(req.query.categoryId) || undefined;
  const rows = await prisma.preventivePlan.findMany({
    where: categoryId ? { categoryId } : {},
    select: { tahun: true },
    distinct: ["tahun"],
    orderBy: { tahun: "desc" },
  });
  res.json(rows.map((r) => r.tahun));
});

// GET /api/preventive-schedules?categoryId=1&tahun=2026 — tabel jadwal satu kategori satu tahun
router.get("/", async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan" });
  const tahun = Number(req.query.tahun);
  if (!Number.isInteger(tahun)) return res.status(422).json({ message: "Tahun wajib diisi" });

  const plans = await prisma.preventivePlan.findMany({
    where: { categoryId: category.id, tahun },
    select: planSelect,
    orderBy: { urutan: "asc" },
  });

  res.json({ category, tahun, plans });
});

// POST /api/preventive-schedules/import/preview?categoryId=1 — baca file tanpa menyimpan
router.post("/import/preview", requireAdmin, excelBody, async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(422).json({ message: "Kategori aset wajib dipilih" });

  const result = await buildPreview(req.body, category.id);
  if ("error" in result) return res.status(422).json({ message: result.error });
  res.json(result);
});

// POST /api/preventive-schedules/import?categoryId=1 — ganti jadwal kategori & tahun tsb dengan isi file
router.post("/import", requireAdmin, excelBody, async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(422).json({ message: "Kategori aset wajib dipilih" });

  const result = await buildPreview(req.body, category.id);
  if ("error" in result) return res.status(422).json({ message: result.error });
  if (!result.valid) return res.status(422).json({ message: result.errors[0] });

  const tahun = result.tahun!;

  await prisma.$transaction(
    async (tx) => {
      // Jadwal lama masih "planned" semua (dicek di preview), aman diganti
      await tx.preventivePlan.deleteMany({ where: { categoryId: category.id, tahun } });
      for (const [i, row] of result.rows.entries()) {
        await tx.preventivePlan.create({
          data: {
            categoryId: category.id,
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
    message: `Jadwal ${category.name} ${tahun} tersimpan: ${result.summary.rows} baris, ${result.summary.schedules} jadwal`,
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

  const schedule = await prisma.preventiveSchedule.findUnique({ where: { id } });
  if (!schedule) return res.status(404).json({ message: "Jadwal tidak ditemukan" });

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

// DELETE /api/preventive-schedules?categoryId=1&tahun=2026 — hapus seluruh jadwal kategori & tahun
router.delete("/", requireAdmin, async (req, res) => {
  const category = await findCategory(req.query.categoryId);
  if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan" });
  const tahun = Number(req.query.tahun);
  if (!Number.isInteger(tahun)) return res.status(422).json({ message: "Tahun wajib diisi" });

  const { count } = await prisma.preventivePlan.deleteMany({ where: { categoryId: category.id, tahun } });
  if (count === 0) return res.status(404).json({ message: "Jadwal tidak ditemukan" });
  res.json({ message: `Jadwal ${category.name} ${tahun} berhasil dihapus` });
});

export default router;
