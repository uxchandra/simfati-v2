import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";

// ===== Konstanta & hook papan andon (dipisah dari komponen supaya fast refresh tetap jalan) =====

export const REFRESH_MS = 15_000; // data diperbarui tiap 15 detik
export const PAGE_MS = 10_000; // halaman tabel berganti tiap 10 detik

// Warna lampu status. Selalu tampil bersama teks label (bukan warna saja).
export const LAMP = {
  green: { dot: "bg-emerald-400", glow: "shadow-[0_0_14px_3px_rgba(52,211,153,0.7)]", text: "text-emerald-300", ring: "border-emerald-500/60", bg: "bg-emerald-500/10" },
  amber: { dot: "bg-amber-400", glow: "shadow-[0_0_14px_3px_rgba(251,191,36,0.7)]", text: "text-amber-300", ring: "border-amber-500/60", bg: "bg-amber-500/10" },
  orange: { dot: "bg-orange-500", glow: "shadow-[0_0_14px_3px_rgba(249,115,22,0.7)]", text: "text-orange-300", ring: "border-orange-500/60", bg: "bg-orange-500/10" },
  red: { dot: "bg-red-500", glow: "shadow-[0_0_16px_4px_rgba(239,68,68,0.8)]", text: "text-red-300", ring: "border-red-500/70", bg: "bg-red-500/15" },
  blue: { dot: "bg-sky-400", glow: "shadow-[0_0_14px_3px_rgba(56,189,248,0.7)]", text: "text-sky-300", ring: "border-sky-500/60", bg: "bg-sky-500/10" },
  gray: { dot: "bg-zinc-500", glow: "", text: "text-zinc-400", ring: "border-zinc-600", bg: "bg-zinc-500/10" },
} as const;

export type LampColor = keyof typeof LAMP;

// Jam yang berdetak tiap detik (dipakai juga untuk durasi berjalan)
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Ambil data andon & perbarui otomatis. Kalau koneksi putus, data terakhir tetap tampil.
export function useAndonData<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    api<T>(endpoint)
      .then((res) => {
        setData(res);
        setError("");
        setUpdatedAt(new Date());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Koneksi ke server terputus"));
  }, [endpoint]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { data, error, updatedAt };
}

// Bagi baris tabel per halaman sesuai tinggi layar, lalu ganti halaman otomatis
export function usePaging<T>(rows: T[], rowHeight: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(8);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // Kurangi tinggi header tabel
      setPerPage(Math.max(1, Math.floor((el.clientHeight - 56) / rowHeight)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rowHeight]);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages - 1);

  useEffect(() => {
    if (pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(timer);
  }, [pages]);

  return { containerRef, visible: rows.slice(current * perPage, current * perPage + perPage), page: current, pages, perPage };
}

// Durasi berjalan "2j 15m" / "3h 4j"
export function elapsed(from: string, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

// Tabel andon: baris besar mudah dibaca dari jauh
export const thClass =
  "sticky top-0 z-10 border-b-2 border-zinc-700 bg-zinc-900 px-3 py-3 text-left text-[clamp(0.7rem,1vw,1.05rem)] font-black tracking-widest text-zinc-400 uppercase";
export const tdClass = "border-b border-zinc-800/80 px-3 text-[clamp(0.85rem,1.25vw,1.4rem)] font-semibold";

