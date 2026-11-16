import type { CheckupShift, CheckupSummary, OuthouseStatus, RepairAction, RepairRequestStatus } from "../types";
import { MONTHS } from "./schedule";

export const SHIFT_LABEL: Record<CheckupShift, string> = {
  morning: "Pagi",
  afternoon: "Sore",
  night: "Malam",
};

// "W3 · November 2026"
export const formatPeriod = (p: { tahun: number; bulan: number; minggu: number }) =>
  `W${p.minggu} · ${MONTHS[p.bulan - 1]} ${p.tahun}`;

export const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Lama pengerjaan, mis. "2 jam 15 menit" / "1 hari 3 jam" (sama seperti v1)
export function formatDuration(start: string, end?: string | null) {
  const minutes = Math.max(0, Math.floor(((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours > 0) return mins > 0 ? `${hours} jam ${mins} menit` : `${hours} jam`;
  return `${mins} menit`;
}

// Tahap status checkup untuk ditampilkan
export type CheckupStage = "draft" | "waiting_ng" | "completed";

export function checkupStage(c: Pick<CheckupSummary, "status" | "submittedAt">): CheckupStage {
  if (c.status === "completed") return "completed";
  return c.submittedAt ? "waiting_ng" : "draft";
}

export const STAGE_LABEL: Record<CheckupStage, string> = {
  draft: "Sedang diisi",
  waiting_ng: "Menunggu penanganan NG",
  completed: "Selesai",
};

export const STAGE_CLASS: Record<CheckupStage, string> = {
  draft: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  waiting_ng: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

// Perkecil foto dari kamera HP (bisa 5–10 MB) sebelum diupload: sisi terpanjang maks 1600px, JPEG.
// Kalau browser tidak bisa memproses, file asli yang dikirim.
export async function compressImage(file: File, maxSize = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file;
  }
}

export const ACTION_LABEL: Record<RepairAction, string> = {
  ganti_part: "Ganti Part",
  inhouse: "Inhouse Repair",
  outhouse: "Outhouse Repair",
};

export const OUTHOUSE_LABEL: Record<OuthouseStatus, string> = {
  pending: "Menunggu subcont",
  on_progress: "Dikerjakan subcont",
  waiting_confirmation: "Menunggu konfirmasi",
  completed: "Selesai",
};

export const OUTHOUSE_CLASS: Record<OuthouseStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  on_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  waiting_confirmation: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

// ===== Repair Request =====

export const RR_STATUS_LABEL: Record<RepairRequestStatus, string> = {
  pending: "Menunggu tindakan",
  in_progress: "Dikerjakan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export const RR_STATUS_CLASS: Record<RepairRequestStatus, string> = {
  pending: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
};
