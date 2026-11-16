import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, Factory, Maximize, Minimize, WifiOff } from "lucide-react";
import { LAMP, REFRESH_MS, useNow, type LampColor } from "./andon";
import { cn } from "@/lib/utils";

// ===== Komponen bersama papan andon (layar TV lantai produksi) =====

export function Lamp({ color, blink, className }: { color: LampColor; blink?: boolean; className?: string }) {
  return <span className={cn("inline-block size-3 shrink-0 rounded-full", LAMP[color].dot, LAMP[color].glow, blink && "animate-pulse", className)} />;
}

// Pil status di tabel: lampu + label
export function StatusPill({ color, label, blink }: { color: LampColor; label: string; blink?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[clamp(0.75rem,1vw,1rem)] font-bold tracking-wide uppercase",
        LAMP[color].ring,
        LAMP[color].bg,
        LAMP[color].text,
      )}
    >
      <Lamp color={color} blink={blink} className="size-2.5" />
      {label}
    </span>
  );
}

// Panel angka besar di bagian atas papan
export function CounterTile({ label, value, color, blink }: { label: string; value: number; color: LampColor; blink?: boolean }) {
  const active = value > 0;
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-xl border-2 bg-zinc-950 px-5 py-3",
        active ? LAMP[color].ring : "border-zinc-800",
        active && blink && "animate-[pulse_1.6s_ease-in-out_infinite]",
      )}
    >
      {/* Garis warna di atas panel */}
      <div className={cn("absolute inset-x-0 top-0 h-1.5", active ? LAMP[color].dot : "bg-zinc-800")} />
      <div className="flex items-center gap-2 pt-1">
        <Lamp color={active ? color : "gray"} blink={active && blink} />
        <span className="text-[clamp(0.8rem,1.15vw,1.25rem)] font-bold tracking-wider text-zinc-300 uppercase">{label}</span>
      </div>
      <span
        className={cn(
          "font-mono text-[clamp(2.5rem,5.5vw,6rem)] leading-none font-black tabular-nums",
          active ? LAMP[color].text : "text-zinc-600",
        )}
      >
        {String(value).padStart(2, "0")}
      </span>
    </div>
  );
}

const DAYS = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];

function Clock() {
  const now = useNow();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex flex-col items-end justify-center rounded-xl border-2 border-zinc-700 bg-zinc-950 px-5 py-2 text-right">
      <span className="text-[clamp(0.75rem,1vw,1.1rem)] font-bold tracking-widest text-zinc-400">
        {DAYS[now.getDay()]}, {pad(now.getDate())}/{pad(now.getMonth() + 1)}/{now.getFullYear()}
      </span>
      <span className="font-mono text-[clamp(1.75rem,3.2vw,3.5rem)] leading-none font-black tabular-nums text-white">
        {pad(now.getHours())}:{pad(now.getMinutes())}
        <span className="text-zinc-500">:{pad(now.getSeconds())}</span>
      </span>
    </div>
  );
}

type ShellProps = {
  title: string;
  subtitle?: string;
  counters: ReactNode;
  children: ReactNode;
  legend: { color: LampColor; label: string }[];
  error: string;
  updatedAt: Date | null;
  page?: { page: number; pages: number };
};

// Kerangka layar andon: header (logo · judul · jam), panel angka, tabel, footer
export default function AndonShell({ title, subtitle, counters, children, legend, error, updatedAt, page }: ShellProps) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    // Selalu gelap, apa pun tema aplikasi
    <div className="dark flex h-dvh flex-col gap-3 overflow-hidden bg-black p-3 text-white sm:p-4">
      {/* ===== Header ===== */}
      <header className="grid shrink-0 grid-cols-[auto_1fr_auto] items-stretch gap-3">
        <div className="flex items-center gap-3 rounded-xl border-2 border-zinc-700 bg-zinc-950 px-4">
          <Factory className="size-[clamp(1.75rem,3vw,3rem)] text-amber-400" />
          <div className="hidden leading-tight sm:block">
            <div className="text-[clamp(1rem,1.6vw,1.75rem)] font-black tracking-widest">SIMFATI</div>
            <div className="text-[clamp(0.6rem,0.8vw,0.85rem)] font-bold tracking-[0.3em] text-zinc-500">MAINTENANCE</div>
          </div>
        </div>
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-zinc-700 bg-gradient-to-b from-zinc-900 to-zinc-950 px-4 py-2 text-center">
          {/* Garis peringatan kuning-hitam khas pabrik */}
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[repeating-linear-gradient(135deg,#facc15_0_12px,#000_12px_24px)] opacity-80" />
          <h1 className="text-[clamp(1.5rem,3.6vw,4rem)] leading-none font-black tracking-[0.12em] uppercase">{title}</h1>
          {subtitle && <p className="mt-1 text-[clamp(0.7rem,1vw,1.1rem)] font-bold tracking-widest text-zinc-400 uppercase">{subtitle}</p>}
        </div>
        <Clock />
      </header>

      {/* ===== Panel angka ===== */}
      <section className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">{counters}</section>

      {/* ===== Tabel ===== */}
      <main className="relative min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-zinc-800 bg-zinc-950">{children}</main>

      {/* ===== Footer ===== */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-[clamp(0.7rem,0.9vw,0.95rem)] font-semibold text-zinc-400">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-2">
            <Lamp color={l.color} className="size-2.5" />
            {l.label}
          </span>
        ))}
        <span className="flex-1" />
        {error ? (
          <span className="inline-flex items-center gap-2 text-red-400">
            <WifiOff className="size-4" /> {error} · menampilkan data terakhir
          </span>
        ) : (
          updatedAt && (
            <span>
              Update {pad(updatedAt.getHours())}:{pad(updatedAt.getMinutes())}:{pad(updatedAt.getSeconds())} · otomatis tiap{" "}
              {REFRESH_MS / 1000} detik
            </span>
          )
        )}
        {page && page.pages > 1 && (
          <span className="rounded border border-zinc-700 px-2 py-0.5 font-mono text-zinc-300">
            HAL {page.page + 1}/{page.pages}
          </span>
        )}
        {/* Tombol kecil, tetap bisa diklik tapi tidak mengganggu tampilan TV */}
        <span className="inline-flex gap-1 opacity-60 transition-opacity hover:opacity-100">
          {!fullscreen && (
            <Link to="/" className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800" title="Kembali ke aplikasi">
              <ArrowLeft className="size-3.5" /> Aplikasi
            </Link>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800"
            title={fullscreen ? "Keluar layar penuh" : "Layar penuh"}
          >
            {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
            {fullscreen ? "Keluar" : "Layar Penuh"}
          </button>
        </span>
      </footer>
    </div>
  );
}

export function EmptyBoard({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
      {icon}
      <span className="text-[clamp(1rem,1.8vw,2rem)] font-bold tracking-wider uppercase">{text}</span>
    </div>
  );
}
