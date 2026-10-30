import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { displayStatus, MONTHS, STATUS_LABEL, weekOf, weekRange } from "../lib/schedule";
import ScheduleMarker from "./ScheduleMarker";
import type { PreventiveSchedule } from "../types";
import { cn } from "@/lib/utils";

export type GridSchedule = Pick<PreventiveSchedule, "bulan" | "minggu" | "tipe"> &
  Partial<Pick<PreventiveSchedule, "id" | "status">>;

export type GridRow<T> = {
  key: string | number;
  no: string;
  grup: string | null;
  nama: string;
  deskripsi: string | null;
  extra?: ReactNode; // mis. badge "belum terhubung asset"
  schedules: GridSchedule[];
  data: T;
};

type Props<T> = {
  tahun: number;
  rows: GridRow<T>[];
  onMarkerClick?: (row: GridRow<T>, schedule: GridSchedule) => void;
  // true = belum disimpan (preview import): semua penanda tampil sebagai terjadwal
  preview?: boolean;
  // Batas tinggi area scroll, mis. "max-h-[60vh]". Header & kolom mesin tetap terlihat saat di-scroll
  className?: string;
};

const WEEKS = [1, 2, 3, 4];

// Tabel jadwal Januari–Desember seperti di Excel: 4 kolom minggu per bulan, penanda di minggu yang dijadwalkan
export default function ScheduleGrid<T>({ tahun, rows, onMarkerClick, preview, className }: Props<T>) {
  const now = weekOf(new Date());
  const isCurrentWeek = (bulan: number, minggu: number) =>
    now.tahun === tahun && now.bulan === bulan && now.minggu === minggu;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  // Tahun yang sudah di-auto-scroll, supaya posisi scroll user tidak direset setiap data berubah
  const scrolledYear = useRef<number | null>(null);

  // Garis "hari ini": diletakkan di dalam kolom minggu berjalan sesuai tanggalnya,
  // lalu tabel otomatis digeser supaya minggu berjalan langsung terlihat
  useLayoutEffect(() => {
    const container = scrollRef.current;
    const line = lineRef.current;
    if (!container || !line) return;

    const place = () => {
      const th = container.querySelector<HTMLElement>("[data-current-week]");
      const table = container.querySelector("table");
      if (!th || !table) {
        line.style.display = "none";
        return;
      }
      const today = new Date();
      const { start, end } = weekRange(tahun, today.getMonth() + 1, weekOf(today).minggu);
      const days = end.getDate() - start.getDate() + 1;
      const fraction = (today.getDate() - start.getDate() + 0.5) / days;
      const x = th.offsetLeft + fraction * th.offsetWidth;
      line.style.display = "block";
      line.style.left = `${x}px`;
      line.style.height = `${table.offsetHeight}px`;

      if (scrolledYear.current !== tahun) {
        scrolledYear.current = tahun;
        // Lebar kolom No + Mesin yang menempel di kiri
        const sticky = container.querySelector<HTMLElement>("[data-sticky-edge]");
        const stickyRight = sticky ? sticky.offsetLeft + sticky.offsetWidth : 0;
        const visible = container.clientWidth - stickyRight;
        container.scrollLeft = Math.max(0, x - stickyRight - visible / 3);
      }
    };

    place();
    // Lebar kolom bisa berubah (resize layar, sidebar dibuka/tutup)
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tahun, rows.length]);

  return (
    // Scroll dua arah di dalam kotak ini (seperti freeze panes Excel), bukan halaman yang memanjang
    <div ref={scrollRef} className={cn("relative overflow-auto", className)}>
      {/* Garis hari ini. z-[5]: di atas sel biasa, di bawah header & kolom kiri yang sticky */}
      <div
        ref={lineRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 z-[5] hidden w-0.5 -translate-x-1/2 bg-sky-500/80"
      />
      {/* border-separate: sticky cell + border-collapse membuat isi yang di-scroll terlihat bocor di Chrome */}
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm [&_td]:border-r [&_td]:border-b [&_th]:border-r [&_th]:border-b">
        <thead>
          <tr>
            <th rowSpan={2} className="sticky top-0 left-0 z-30 w-10 min-w-10 max-w-10 bg-muted px-2 py-2 text-center font-medium">
              No
            </th>
            <th
              rowSpan={2}
              data-sticky-edge
              className="sticky top-0 left-10 z-30 min-w-56 bg-muted px-3 py-2 text-left font-medium">
              Mesin / Aktivitas
            </th>
            {MONTHS.map((month) => (
              <th key={month} colSpan={4} className="sticky top-0 z-20 h-8 bg-muted px-1 text-center text-xs font-medium">
                {month}
              </th>
            ))}
          </tr>
          <tr>
            {MONTHS.flatMap((month, m) =>
              WEEKS.map((w) => (
                <th
                  key={`${month}-${w}`}
                  data-current-week={isCurrentWeek(m + 1, w) || undefined}
                  title={isCurrentWeek(m + 1, w) ? "Minggu ini" : undefined}
                  className={cn(
                    // Baris minggu menempel tepat di bawah baris bulan (h-8); latar harus solid karena isi lewat di bawahnya
                    "sticky top-8 z-20 w-7 bg-muted px-0 py-1 text-center text-[10px] font-normal text-muted-foreground",
                    isCurrentWeek(m + 1, w) &&
                      "bg-[color-mix(in_oklab,var(--primary)_12%,var(--muted))] font-semibold text-foreground shadow-[inset_0_-2px_0_var(--color-sky-500)]",
                  )}
                >
                  W{w}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const showGroup = row.grup && row.grup !== rows[i - 1]?.grup;
            // Satu minggu bisa punya periodik & tahunan sekaligus
            const byWeek = new Map<string, GridSchedule[]>();
            for (const s of row.schedules) {
              const key = `${s.bulan}-${s.minggu}`;
              byWeek.set(key, [...(byWeek.get(key) ?? []), s]);
            }

            return (
              <Fragment key={row.key}>
                {showGroup && (
                  <tr className="bg-muted/30">
                    <td colSpan={2} className="sticky left-0 z-10 bg-muted px-3 py-1.5 text-xs font-semibold uppercase">
                      {row.grup}
                    </td>
                    <td colSpan={48} />
                  </tr>
                )}
                <tr className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-background px-2 py-1.5 text-center text-muted-foreground">
                    {row.no}
                  </td>
                  <td className="sticky left-10 z-10 bg-background px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.nama}</span>
                      {row.extra}
                    </div>
                    {row.deskripsi && <div className="text-xs text-muted-foreground">{row.deskripsi}</div>}
                  </td>
                  {MONTHS.flatMap((_, m) =>
                    WEEKS.map((w) => {
                      const key = `${m + 1}-${w}`;
                      const markers = byWeek.get(key) ?? [];
                      return (
                        <td
                          key={key}
                          className={cn("w-7 px-0 py-1 text-center", isCurrentWeek(m + 1, w) && "bg-primary/5")}
                        >
                          <div className="flex items-center justify-center gap-0.5">
                            {markers.map((s) => {
                              const status = preview ? "planned" : displayStatus({ ...s, status: s.status ?? "planned" }, tahun);
                              const title = `${row.nama} · ${MONTHS[m]} W${w} · ${STATUS_LABEL[status]}`;
                              return onMarkerClick ? (
                                <button
                                  key={`${s.tipe}`}
                                  type="button"
                                  title={title}
                                  onClick={() => onMarkerClick(row, s)}
                                  className="rounded-full p-0.5 transition-transform hover:scale-125 focus-visible:outline-2"
                                >
                                  <ScheduleMarker tipe={s.tipe} status={status} />
                                </button>
                              ) : (
                                <span key={`${s.tipe}`} title={title} className="p-0.5">
                                  <ScheduleMarker tipe={s.tipe} status={status} />
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      );
                    }),
                  )}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
