import type { Prisma } from "../generated/prisma/client";

// Minggu dalam bulan, sama dengan tabel Jadwal Preventive: W1 = 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–akhir
export function currentPeriod(now = new Date()) {
  return {
    tahun: now.getFullYear(),
    bulan: now.getMonth() + 1,
    minggu: Math.min(4, Math.ceil(now.getDate() / 7)),
  };
}

// Jadwal yang sudah boleh dikerjakan: minggu ini atau minggu-minggu sebelumnya (terlambat)
export function dueScheduleWhere(now = new Date()): Prisma.PreventiveScheduleWhereInput {
  const { tahun, bulan, minggu } = currentPeriod(now);
  return {
    OR: [
      { plan: { tahun: { lt: tahun } } },
      { plan: { tahun }, bulan: { lt: bulan } },
      { plan: { tahun }, bulan, minggu: { lte: minggu } },
    ],
  };
}

export function isDue(s: { tahun: number; bulan: number; minggu: number }, now = new Date()) {
  const c = currentPeriod(now);
  return s.tahun < c.tahun || (s.tahun === c.tahun && (s.bulan < c.bulan || (s.bulan === c.bulan && s.minggu <= c.minggu)));
}

// Sama seperti v1: pagi 07–15, sore 15–23, malam 23–07
export function currentShift(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 7 && hour < 15) return "morning" as const;
  if (hour >= 15 && hour < 23) return "afternoon" as const;
  return "night" as const;
}

// Prefix nomor checkup dari inisial kategori, mis. "Mesin Press" -> "GC-MP-"
export function checkupCodePrefix(categoryName: string) {
  const initials = categoryName
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase())
    .join("");
  return `GC-${initials || "X"}-`;
}

// Nomor berikutnya dari kode terakhir, mis. ("GC-MP-", "GC-MP-041") -> "GC-MP-042"
export function nextCheckupCode(prefix: string, lastCode: string | null) {
  const last = lastCode ? Number(lastCode.slice(prefix.length)) || 0 : 0;
  return prefix + String(last + 1).padStart(3, "0");
}
