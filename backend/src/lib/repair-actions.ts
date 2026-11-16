import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "./prisma";
import type { Prisma, RepairAction } from "../generated/prisma/client";

// Logika penanganan kerusakan yang dipakai bersama oleh poin NG general checkup dan repair request:
// pilih tindakan (ganti part / inhouse / outhouse), pasang part, batalkan part, dan syarat menutup.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

// Bungkus handler supaya HttpError otomatis jadi respon JSON
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ message: err.message, ...(err.errors ? { errors: err.errors } : {}) });
      }
      throw err;
    }
  };

// Sumber penanganan: satu poin NG checkup atau satu repair request
export type RepairTarget = { detailId: number } | { repairRequestId: number };

const targetWhere = (t: RepairTarget) =>
  "detailId" in t ? { detailId: t.detailId } : { repairRequestId: t.repairRequestId };

// Data minimal untuk menentukan apa yang boleh dilakukan
export const repairStateInclude = {
  inhouseRepair: { select: { id: true } },
  outhouseRepair: { select: { status: true } },
  partRequests: { select: { id: true, installedAt: true } },
} as const;

export type RepairState = {
  repairAction: RepairAction | null;
  inhouseRepair: { id: number } | null;
  outhouseRepair: { status: string } | null;
  partRequests: { id: number; installedAt: Date | null }[];
};

// Data lengkap untuk ditampilkan di frontend
export const repairDataSelect = {
  repairAction: true,
  inhouseRepair: { select: { problem: true, perbaikan: true, createdAt: true, user: { select: { name: true } } } },
  outhouseRepair: {
    select: {
      id: true,
      problem: true,
      perbaikan: true,
      status: true,
      hasil: true,
      startedAt: true,
      finishedAt: true,
      confirmedAt: true,
      subcont: { select: { id: true, nama: true } },
    },
  },
  partRequests: {
    select: {
      id: true,
      quantity: true,
      keterangan: true,
      installedAt: true,
      sparepart: { select: { id: true, kodeBarang: true, namaBarang: true, uom: true, stok: true } },
    },
    orderBy: { id: "asc" },
  },
} as const;

// id sparepart BIGINT tidak bisa langsung di-JSON-kan
export function repairDataToJson<T extends { partRequests: { sparepart: { id: bigint } }[] }>(row: T) {
  return {
    ...row,
    partRequests: row.partRequests.map((p) => ({ ...p, sparepart: { ...p.sparepart, id: Number(p.sparepart.id) } })),
  };
}

// Alasan tindakan lama tidak boleh diganti (sudah ada progres), atau null kalau boleh
export function lockedReason(state: RepairState) {
  if (state.repairAction === "ganti_part" && state.partRequests.some((p) => p.installedAt)) {
    return "Sudah ada part yang terpasang, tindakan tidak bisa diganti";
  }
  if (state.repairAction === "outhouse" && state.outhouseRepair && state.outhouseRepair.status !== "pending") {
    return "Subcont sudah mulai mengerjakan, tindakan tidak bisa diganti";
  }
  return null;
}

// Alasan belum boleh ditutup, atau null kalau boleh
export function closeBlocker(state: RepairState) {
  if (!state.repairAction) return "Pilih tindakan penanganan terlebih dahulu";
  if (state.repairAction === "inhouse" && !state.inhouseRepair) return "Isi data inhouse repair terlebih dahulu";
  if (state.repairAction === "ganti_part") {
    if (state.partRequests.length === 0) return "Belum ada part yang diminta";
    const notInstalled = state.partRequests.filter((p) => !p.installedAt).length;
    if (notInstalled > 0) return `Masih ada ${notInstalled} part yang belum terpasang`;
  }
  if (state.repairAction === "outhouse") {
    const status = state.outhouseRepair?.status;
    if (status === "pending") return "Subcont belum mulai mengerjakan perbaikan";
    if (status === "on_progress") return "Subcont masih mengerjakan perbaikan";
    if (status !== "waiting_confirmation") return "Status outhouse repair tidak valid untuk ditutup";
  }
  return null;
}

const requiredText = (label: string) =>
  z.string({ error: `${label} wajib diisi` }).trim().min(1, `${label} wajib diisi`);

const partItemSchema = z.object({
  sparepartId: z.coerce.number({ error: "Sparepart wajib dipilih" }).int().positive("Sparepart wajib dipilih"),
  quantity: z.coerce.number({ error: "Jumlah harus angka" }).int("Jumlah harus bilangan bulat").min(1, "Jumlah minimal 1"),
  keterangan: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null),
});

export const actionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({ action: z.literal("inhouse"), problem: requiredText("Problem"), perbaikan: requiredText("Perbaikan") }),
    z.object({
      action: z.literal("outhouse"),
      subcontId: z.coerce.number({ error: "Subcont wajib dipilih" }).int().positive("Subcont wajib dipilih"),
      problem: requiredText("Problem"),
      perbaikan: requiredText("Perbaikan yang diminta"),
    }),
    // Kalau tindakannya sudah ganti part, item baru ditambahkan ke daftar part yang ada
    z.object({ action: z.literal("ganti_part"), items: z.array(partItemSchema).min(1, "Pilih minimal satu part") }),
  ],
  { error: "Tindakan tidak valid" },
);

export type ActionInput = z.infer<typeof actionSchema>;

export function parseAction(body: unknown): ActionInput {
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "Data tidak valid", z.flattenError(parsed.error).fieldErrors);
  return parsed.data;
}

// Simpan tindakan. `setAction` mengisi kolom repairAction di sumbernya (checkup_details / repair_requests).
export async function applyAction(
  target: RepairTarget,
  state: RepairState,
  input: ActionInput,
  userId: number,
  setAction: (tx: Prisma.TransactionClient, action: RepairAction) => Promise<unknown>,
) {
  // Ganti jenis tindakan = data tindakan lama dihapus, hanya boleh kalau belum ada progres
  const switching = state.repairAction !== null && state.repairAction !== input.action;
  const editingStartedOuthouse =
    input.action === "outhouse" && state.outhouseRepair && state.outhouseRepair.status !== "pending";
  const reason = switching || editingStartedOuthouse ? lockedReason(state) : null;
  if (reason) throw new HttpError(400, reason);

  if (input.action === "outhouse") {
    const subcont = await prisma.subcont.findFirst({ where: { id: input.subcontId, status: "active" } });
    if (!subcont) throw new HttpError(422, "Data tidak valid", { subcontId: ["Subcont tidak ditemukan / tidak aktif"] });
  }
  if (input.action === "ganti_part") {
    const ids = [...new Set(input.items.map((i) => BigInt(i.sparepartId)))];
    const found = await prisma.sparepart.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new HttpError(422, "Ada sparepart yang tidak ditemukan");
  }

  const where = targetWhere(target);
  await prisma.$transaction(async (tx) => {
    if (switching) {
      await tx.inhouseRepair.deleteMany({ where });
      await tx.outhouseRepair.deleteMany({ where });
      await tx.checkupPartRequest.deleteMany({ where });
    }
    await setAction(tx, input.action);

    if (input.action === "inhouse") {
      const data = { problem: input.problem, perbaikan: input.perbaikan, userId };
      const existing = await tx.inhouseRepair.findFirst({ where, select: { id: true } });
      if (existing) await tx.inhouseRepair.update({ where: { id: existing.id }, data });
      else await tx.inhouseRepair.create({ data: { ...where, ...data } });
    } else if (input.action === "outhouse") {
      const data = { subcontId: input.subcontId, problem: input.problem, perbaikan: input.perbaikan, userId };
      const existing = await tx.outhouseRepair.findFirst({ where, select: { id: true } });
      if (existing) await tx.outhouseRepair.update({ where: { id: existing.id }, data });
      else await tx.outhouseRepair.create({ data: { ...where, ...data } });
    } else {
      await tx.checkupPartRequest.createMany({
        data: input.items.map((item) => ({
          ...where,
          sparepartId: BigInt(item.sparepartId),
          quantity: item.quantity,
          keterangan: item.keterangan,
          userId,
        })),
      });
    }
  });

  const messages = {
    inhouse: "Inhouse repair disimpan",
    outhouse: "Permintaan outhouse repair dikirim ke subcont",
    ganti_part: "Permintaan part disimpan",
  };
  return messages[input.action];
}

// Tandai part terpasang & kurangi stok
export async function installPart(target: RepairTarget, partIdParam: unknown) {
  const part = await prisma.checkupPartRequest.findFirst({
    where: { id: Number(partIdParam) || 0, ...targetWhere(target) },
    include: { sparepart: { select: { kodeBarang: true, stok: true, uom: true } } },
  });
  if (!part) throw new HttpError(404, "Permintaan part tidak ditemukan");
  if (part.installedAt) throw new HttpError(400, "Part ini sudah ditandai terpasang");

  await prisma.$transaction(async (tx) => {
    // Kurangi stok hanya kalau cukup (dicek di database supaya aman dari pemakaian bersamaan)
    const taken = await tx.sparepart.updateMany({
      where: { id: part.sparepartId, stok: { gte: part.quantity } },
      data: { stok: { decrement: part.quantity } },
    });
    if (taken.count === 0) {
      const stok = part.sparepart.stok ?? 0;
      throw new HttpError(
        400,
        `Stok ${part.sparepart.kodeBarang} tidak cukup (tersisa ${stok} ${part.sparepart.uom ?? ""}, butuh ${part.quantity})`.replace(/\s+,/, ","),
      );
    }
    await tx.checkupPartRequest.update({ where: { id: part.id }, data: { installedAt: new Date() } });
  });

  return `${part.sparepart.kodeBarang} ditandai terpasang, stok berkurang ${part.quantity}`;
}

// Batalkan permintaan part yang belum terpasang. Part terakhir dihapus -> tindakan dikosongkan lagi.
export async function cancelPart(
  target: RepairTarget,
  partIdParam: unknown,
  clearAction: (tx: Prisma.TransactionClient) => Promise<unknown>,
) {
  const where = targetWhere(target);
  const part = await prisma.checkupPartRequest.findFirst({ where: { id: Number(partIdParam) || 0, ...where } });
  if (!part) throw new HttpError(404, "Permintaan part tidak ditemukan");
  if (part.installedAt) throw new HttpError(400, "Part yang sudah terpasang tidak bisa dibatalkan");

  await prisma.$transaction(async (tx) => {
    await tx.checkupPartRequest.delete({ where: { id: part.id } });
    const left = await tx.checkupPartRequest.count({ where });
    if (left === 0) await clearAction(tx);
  });
  return "Permintaan part dibatalkan";
}

// Saat ditutup: outhouse repair ikut dikonfirmasi selesai
export async function confirmOuthouseOnClose(tx: Prisma.TransactionClient, target: RepairTarget, state: RepairState, now: Date) {
  if (state.repairAction === "outhouse") {
    await tx.outhouseRepair.updateMany({ where: targetWhere(target), data: { status: "completed", confirmedAt: now } });
  }
}

// Riwayat yang tidak boleh hilang: part terpasang (stok sudah berkurang) / subcont sudah mulai
export async function hasRepairProgress(where: Prisma.CheckupPartRequestWhereInput & Prisma.OuthouseRepairWhereInput) {
  const [installed, started] = await Promise.all([
    prisma.checkupPartRequest.count({ where: { ...where, installedAt: { not: null } } as Prisma.CheckupPartRequestWhereInput }),
    prisma.outhouseRepair.count({ where: { ...where, status: { not: "pending" } } as Prisma.OuthouseRepairWhereInput }),
  ]);
  return installed > 0 || started > 0;
}
