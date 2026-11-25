import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, Maximize, Minimize, WifiOff } from "lucide-react";
import { STATUS_TEXT, useNow, type StatusColor } from "./andon";
import { cn } from "@/lib/utils";

// ===== Kerangka papan andon (layar TV lantai produksi), desain mengikuti andon SIMFATI v1 =====

const FONT_ID = "andon-montserrat";

// Font Montserrat hanya dimuat saat papan andon dibuka
function useMontserrat() {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(link);
  }, []);
}

function Clock() {
  const now = useNow();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="leading-tight">
      <div className="text-[22px] font-bold">
        {pad(now.getDate())}/{pad(now.getMonth() + 1)}/{now.getFullYear()}
      </div>
      <div className="text-[22px] font-black tracking-[2px] tabular-nums">
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
      </div>
    </div>
  );
}

export type SummaryItem = { label: string; value: number; color: StatusColor; blink?: boolean };

// Panel ringkasan di bawah header: satu kotak per status, angka besar berwarna (abu-abu kalau 0)
function Summary({ items }: { items: SummaryItem[] }) {
  return (
    <section
      className="grid shrink-0 border-b-[3px] border-white"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = item.value > 0;
        return (
          <div
            key={item.label}
            className="flex flex-col items-center justify-center gap-1 border-r-[3px] border-white px-2 py-2 text-center last:border-r-0"
          >
            <span className="truncate text-[clamp(13px,1.2vw,20px)] font-extrabold tracking-[1px] uppercase">
              {item.label}
            </span>
            <span
              className={cn(
                "text-[clamp(32px,4.2vw,72px)] leading-none font-black tabular-nums",
                active ? STATUS_TEXT[item.color] : "text-[#4b5563]",
                active && item.blink && "animate-pulse",
              )}
            >
              {item.value}
            </span>
          </div>
        );
      })}
    </section>
  );
}

type ShellProps = {
  title: string; // mis. "GENERAL CHECKUP MONITORING"
  // Ringkasan jumlah per status, tampil di antara header dan tabel
  summary?: SummaryItem[];
  children: ReactNode;
  // Teks berjalan di bawah layar (kosong = tidak ditampilkan)
  ticker?: ReactNode;
  error: string;
  page?: { page: number; pages: number };
};

export default function AndonShell({ title, summary, children, ticker, error, page }: ShellProps) {
  useMontserrat();
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

  return (
    // Selalu hitam, apa pun tema aplikasi
    <div className="dark flex h-dvh flex-col overflow-hidden bg-black font-['Montserrat',sans-serif] text-white">
      {/* ===== Navbar: logo | judul | jam ===== */}
      <nav className="grid shrink-0 grid-cols-[150px_1fr_200px] border-b-[3px] border-white">
        <div className="flex items-center justify-center border-r-[3px] border-white p-2.5">
          <img src="/logo.png" alt="Logo" className="block h-auto w-[110px]" />
        </div>
        <div className="flex min-w-0 items-center justify-center p-2.5 text-center">
          <h1 className="truncate text-[clamp(28px,4vw,55px)] font-bold tracking-[2px] uppercase">{title}</h1>
        </div>
        <div className="flex flex-col items-center justify-center border-l-[3px] border-white p-2.5 text-center">
          <Clock />
          {/* Indikator kecil: halaman tabel & koneksi */}
          {(error || (page && page.pages > 1)) && (
            <div className="mt-0.5 flex items-center gap-2 text-xs font-semibold">
              {page && page.pages > 1 && (
                <span className="text-[#9ca3af]">
                  Hal {page.page + 1}/{page.pages}
                </span>
              )}
              {error && (
                <span className="inline-flex items-center gap-1 text-[#f87171]" title={error}>
                  <WifiOff className="size-3.5" /> Offline
                </span>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* ===== Ringkasan ===== */}
      {summary && <Summary items={summary} />}

      {/* ===== Tabel ===== */}
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      {/* ===== Teks berjalan ===== */}
      {ticker && (
        <div className="shrink-0 overflow-hidden border-t-2 border-[#333] bg-[#111] py-2 whitespace-nowrap">
          <div className="inline-block animate-[andon-ticker_80s_linear_infinite] pl-[100%] text-sm font-bold text-[#fbbf24]">
            {ticker}
          </div>
        </div>
      )}

      {/* Tombol kecil di pojok, hanya terlihat saat kursor diarahkan (tidak mengganggu tampilan TV) */}
      <div
        className={cn(
          "fixed right-2 z-50 flex gap-1 text-xs opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100",
          ticker ? "bottom-11" : "bottom-2",
        )}
      >
        {!fullscreen && (
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded border border-zinc-600 bg-black px-2 py-1 hover:bg-zinc-800"
            title="Kembali ke aplikasi"
          >
            <ArrowLeft className="size-3.5" /> Aplikasi
          </Link>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1 rounded border border-zinc-600 bg-black px-2 py-1 hover:bg-zinc-800"
          title={fullscreen ? "Keluar layar penuh" : "Layar penuh"}
        >
          {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          {fullscreen ? "Keluar" : "Layar Penuh"}
        </button>
      </div>
    </div>
  );
}

// Pesan kosong / memuat: di luar tabel (tanpa garis), di tengah sisa layar di bawah header tabel
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-center text-[clamp(18px,1.8vw,32px)] font-bold text-[#9ca3af]">
      {text}
    </div>
  );
}
