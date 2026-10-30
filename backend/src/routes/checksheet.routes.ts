import express, { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { buildTemplate, parseChecksheetWorkbook, type ParsedSheet } from "../lib/checksheet-excel";

const router = Router();

// Semua route wajib login; import/hapus khusus admin
router.use(requireAuth);

const checksheetSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} as const;

const itemSelect = { id: true, urutan: true, bagian: true, poin: true, metode: true, standar: true } as const;

// File Excel dikirim mentah (application/octet-stream), bukan multipart
const excelBody = express.raw({ type: "application/octet-stream", limit: "10mb" });

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type PreviewSheet = ParsedSheet & {
  categoryId: number | null;
  // Checksheet dengan nama sama di kategori yang sama (akan diganti isinya)
  existing: { id: number; itemCount: number } | null;
};

// Baca file lalu cocokkan dengan data di database (kategori & checksheet yang sudah ada)
async function buildPreview(body: unknown) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return { error: "File Excel wajib diupload" } as const;
  }

  let parsed: ParsedSheet[];
  try {
    parsed = await parseChecksheetWorkbook(body);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan formatnya .xlsx dan memakai template checksheet" } as const;
  }

  if (parsed.length === 0) return { error: "Tidak ada sheet checksheet di dalam file" } as const;

  const kategoriList = await prisma.kategoriAset.findMany({ select: { id: true, name: true } });
  const kategoriByName = new Map(kategoriList.map((k) => [k.name.trim().toLowerCase(), k]));

  const seen = new Map<string, string>();
  const sheets: PreviewSheet[] = [];

  for (const sheet of parsed) {
    const errors = [...sheet.errors];
    const kategori = sheet.kategori ? kategoriByName.get(sheet.kategori.toLowerCase()) : undefined;
    if (sheet.kategori && !kategori) errors.push(`Kategori aset "${sheet.kategori}" tidak terdaftar di sistem`);

    let existing: PreviewSheet["existing"] = null;
    if (kategori && sheet.name) {
      // Nama checksheet tidak boleh dobel di file yang sama untuk kategori yang sama
      const key = `${kategori.id}|${sheet.name.toLowerCase()}`;
      if (seen.has(key)) errors.push(`Nama checksheet "${sheet.name}" sudah dipakai di sheet "${seen.get(key)}"`);
      seen.set(key, sheet.sheet);

      const found = await prisma.checksheet.findFirst({
        where: { categoryId: kategori.id, name: sheet.name },
        select: { id: true, _count: { select: { items: true } } },
      });
      if (found) existing = { id: found.id, itemCount: found._count.items };
    }

    sheets.push({ ...sheet, errors, categoryId: kategori?.id ?? null, existing });
  }

  return { sheets, valid: sheets.every((s) => s.errors.length === 0) } as const;
}

// GET /api/checksheets/template — download template Excel kosong
router.get("/template", async (_req, res) => {
  const kategori = await prisma.kategoriAset.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  const file = await buildTemplate(kategori.map((k) => k.name));

  res.setHeader("Content-Type", XLSX_MIME);
  res.setHeader("Content-Disposition", 'attachment; filename="template-checksheet.xlsx"');
  res.send(file);
});

// POST /api/checksheets/import/preview — cek isi file tanpa menyimpan
router.post("/import/preview", requireAdmin, excelBody, async (req, res) => {
  const result = await buildPreview(req.body);
  if ("error" in result) return res.status(422).json({ message: result.error });
  res.json(result);
});

// POST /api/checksheets/import — simpan semua sheet; ditolak kalau ada satu saja yang error
router.post("/import", requireAdmin, excelBody, async (req, res) => {
  const result = await buildPreview(req.body);
  if ("error" in result) return res.status(422).json({ message: result.error });
  if (!result.valid) {
    return res.status(422).json({ message: "Masih ada data yang tidak valid, cek preview terlebih dahulu" });
  }

  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const sheet of result.sheets) {
      const items = sheet.items.map((item, i) => ({
        urutan: i + 1,
        bagian: item.bagian,
        poin: item.poin,
        metode: item.metode,
        standar: item.standar,
      }));

      if (sheet.existing) {
        // Nama sama di kategori yang sama = revisi: ganti seluruh poin pemeriksaan
        await tx.checksheetItem.deleteMany({ where: { checksheetId: sheet.existing.id } });
        await tx.checksheet.update({
          where: { id: sheet.existing.id },
          data: { name: sheet.name, items: { create: items } },
        });
        updated++;
      } else {
        await tx.checksheet.create({
          data: { categoryId: sheet.categoryId!, name: sheet.name, items: { create: items } },
        });
        created++;
      }
    }
  });

  res.status(201).json({ message: `${created} checksheet baru, ${updated} checksheet diperbarui`, created, updated });
});

// GET /api/checksheets?search=&categoryId=&page=1
router.get("/", async (req, res) => {
  const search = String(req.query.search ?? "");
  const categoryId = Number(req.query.categoryId) || undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = 10;

  const where = {
    ...(categoryId ? { categoryId } : {}),
    ...(search ? { name: { contains: search } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.checksheet.findMany({
      where,
      select: checksheetSelect,
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.checksheet.count({ where }),
  ]);

  res.json({
    data: data.map(({ _count, ...c }) => ({ ...c, itemCount: _count.items })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  });
});

// GET /api/checksheets/options?categoryId=1 — pilihan checksheet untuk dropdown (mis. di form asset)
router.get("/options", async (req, res) => {
  const categoryId = Number(req.query.categoryId) || undefined;
  const data = await prisma.checksheet.findMany({
    where: categoryId ? { categoryId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(data);
});

// GET /api/checksheets/:id — detail beserta poin pemeriksaan
router.get("/:id", async (req, res) => {
  const checksheet = await prisma.checksheet.findUnique({
    where: { id: Number(req.params.id) },
    select: { ...checksheetSelect, items: { select: itemSelect, orderBy: { urutan: "asc" } } },
  });

  if (!checksheet) return res.status(404).json({ message: "Checksheet tidak ditemukan" });
  const { _count, ...rest } = checksheet;
  res.json({ ...rest, itemCount: _count.items });
});

// DELETE /api/checksheets/:id
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const checksheet = await prisma.checksheet.findUnique({ where: { id } });
  if (!checksheet) return res.status(404).json({ message: "Checksheet tidak ditemukan" });

  // Poin pemeriksaan ikut terhapus (onDelete: Cascade)
  await prisma.checksheet.delete({ where: { id } });
  res.json({ message: "Checksheet berhasil dihapus" });
});

export default router;
