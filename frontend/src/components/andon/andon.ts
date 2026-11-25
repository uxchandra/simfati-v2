import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";

// ===== Konstanta & hook papan andon (dipisah dari komponen supaya fast refresh tetap jalan) =====

export const REFRESH_MS = 5_000; // data diperbarui tiap 5 detik (sama seperti SIMFATI v1)
export const PAGE_MS = 10_000; // kalau baris tidak muat satu layar, halaman tabel berganti tiap 10 detik

// Warna teks status, mengikuti andon SIMFATI v1
export const STATUS_TEXT = {
  gray: "text-[#9ca3af]",
  red: "text-[#f87171]",
  amber: "text-[#fbbf24]",
  orange: "text-[#fb923c]",
  blue: "text-[#60a5fa]",
  purple: "text-[#a78bfa]",
  green: "text-[#34d399]",
} as const;

export type StatusColor = keyof typeof STATUS_TEXT;

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

  const load = useCallback(() => {
    if (document.hidden) return;
    api<T>(endpoint)
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Koneksi ke server terputus"));
  }, [endpoint]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    // Tab kembali terlihat -> langsung ambil data terbaru
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { data, error };
}

// Bagi baris tabel per halaman sesuai tinggi layar, lalu ganti halaman otomatis
export function usePaging<T>(rows: T[], rowHeight: number, headerHeight = 40) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setPerPage(Math.max(1, Math.floor((el.clientHeight - headerHeight) / rowHeight)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rowHeight, headerHeight]);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages - 1);

  useEffect(() => {
    if (pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(timer);
  }, [pages]);

  return { containerRef, visible: rows.slice(current * perPage, current * perPage + perPage), page: current, pages, perPage };
}

// Durasi singkat seperti SIMFATI v1: "45m" / "3j" / "2h"
export function durationShort(from: string, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j`;
  return `${Math.floor(hours / 24)}h`;
}

// Tanggal dd/mm/yyyy
export function formatDateDMY(value: string | Date) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Tabel andon gaya SIMFATI v1: hitam, garis putih, teks di tengah, satu baris per sel
export const tableClass = "w-full table-fixed border-collapse border-2 border-white bg-black text-white";
export const thClass =
  "sticky top-0 z-10 border border-white bg-[#111827] px-[5px] py-1.5 text-center align-middle text-[clamp(14px,1.2vw,18px)] font-extrabold tracking-[0.5px] whitespace-nowrap";
export const tdClass =
  "overflow-hidden border border-white px-[5px] py-[5px] text-center align-middle text-[clamp(14px,1.15vw,17px)] font-normal text-ellipsis whitespace-nowrap";
// Latar baris selang-seling + hover (dipasang di <tr>)
export const rowClass = "bg-[#0a0a0a] even:bg-[#0f0f0f] hover:bg-[#2a2a2a] transition-colors";
