import type { PreventiveSchedule } from "../types";

export const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// Status yang ditampilkan: "overdue" = masih planned padahal minggunya sudah lewat
export type DisplayStatus = "planned" | "overdue" | "in_progress" | "done";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  planned: "Terjadwal",
  overdue: "Terlambat",
  in_progress: "In progress",
  done: "Selesai",
};

// Warna titik per status (dipakai sebagai text color, shape memakai currentColor)
export const STATUS_COLOR: Record<DisplayStatus, string> = {
  planned: "text-muted-foreground",
  overdue: "text-red-500",
  in_progress: "text-amber-400",
  done: "text-emerald-500",
};

// Rentang tanggal minggu: W1 = 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–akhir bulan
export function weekRange(tahun: number, bulan: number, minggu: number) {
  const lastDay = new Date(tahun, bulan, 0).getDate();
  const start = (minggu - 1) * 7 + 1;
  const end = minggu === 4 ? lastDay : minggu * 7;
  return { start: new Date(tahun, bulan - 1, start), end: new Date(tahun, bulan - 1, end) };
}

// Minggu berjalan (W1..W4) untuk tanggal tertentu
export function weekOf(date: Date) {
  return { tahun: date.getFullYear(), bulan: date.getMonth() + 1, minggu: Math.min(4, Math.ceil(date.getDate() / 7)) };
}

export function displayStatus(schedule: Pick<PreventiveSchedule, "bulan" | "minggu" | "status">, tahun: number, today = new Date()) {
  if (schedule.status !== "planned") return schedule.status;
  const { end } = weekRange(tahun, schedule.bulan, schedule.minggu);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayStart > end ? "overdue" : "planned";
}

export const formatDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
