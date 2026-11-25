import { useState } from "react";
import { Link } from "react-router";
import { Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Grafik ringan tanpa library: batang HTML + tooltip saat hover.
// Warna seri memakai token --viz-1 / --viz-2 (palet tervalidasi untuk buta warna, terang & gelap).

export type Series = { name: string; color: string; values: number[] };

// Skala sumbu y yang "rapi": 0..max dibulatkan ke atas, 2 garis bantu
function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 2 >= value)! * pow;
  return step * 2;
}

// Batang per bulan, satu atau beberapa seri berdampingan (satu sumbu, satuan sama)
export function MonthlyBars({ labels, series, height = 200 }: { labels: string[]; series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const total = series.reduce((n, s) => n + s.values.reduce((a, b) => a + b, 0), 0);
  const ticks = [max, max / 2, 0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {/* Legenda hanya kalau lebih dari satu seri (satu seri sudah dinamai judul) */}
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setShowTable((v) => !v)}>
          <Table2 /> {showTable ? "Grafik" : "Tabel"}
        </Button>
      </div>

      {showTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border text-sm">
          <table className="w-full">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Bulan</th>
                {series.map((s) => (
                  <th key={s.name} className="px-3 py-2 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {labels.map((label, i) => (
                <tr key={label}>
                  <td className="px-3 py-1.5">{label}</td>
                  {series.map((s) => (
                    <td key={s.name} className="px-3 py-1.5 text-right tabular-nums">
                      {s.values[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" role="img" aria-label={`Grafik per bulan: ${series.map((s) => s.name).join(", ")}`}>
          {total === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground">
              Belum ada data 12 bulan terakhir
            </div>
          )}
          <div className="flex gap-2">
            {/* Sumbu y */}
            <div className="flex flex-col justify-between pb-6 text-right text-xs text-muted-foreground tabular-nums" style={{ height }}>
              {ticks.map((t) => (
                <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
                  {t}
                </span>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              {/* Garis bantu (samar) */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: height - 24 }}>
                {ticks.map((t) => (
                  <div key={t} className={cn("border-t", t === 0 ? "border-border" : "border-dashed border-border/60")} />
                ))}
              </div>

              <div className="flex" style={{ height }}>
                {labels.map((label, i) => (
                  <div
                    key={label}
                    className="relative flex flex-1 flex-col items-center"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {/* Kolom hover: area sentuh selebar satu bulan */}
                    <div className={cn("flex w-full flex-1 items-end justify-center gap-[2px] rounded-t-md px-[15%]", hover === i && "bg-muted/60")}>
                      {series.map((s) => (
                        <div
                          key={s.name}
                          className="w-full max-w-5 rounded-t-[4px] transition-[height]"
                          style={{ height: `${(s.values[i] / max) * 100}%`, background: s.color, minHeight: s.values[i] > 0 ? 2 : 0 }}
                        />
                      ))}
                    </div>
                    <span className="mt-1 h-5 text-[11px] text-muted-foreground">{label}</span>

                    {hover === i && (
                      <div className="pointer-events-none absolute bottom-full z-20 mb-1 min-w-32 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                        <div className="mb-1 font-medium">{label}</div>
                        {series.map((s) => (
                          <div key={s.name} className="flex items-center gap-1.5">
                            <span className="size-2 rounded-sm" style={{ background: s.color }} />
                            <span className="text-muted-foreground">{s.name}</span>
                            <span className="ml-auto pl-3 font-medium tabular-nums">{s.values[i]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Batang horizontal satu seri, nilai ditulis di ujung (cocok untuk kategori dengan nama panjang).
// Item dengan `to` jadi link yang bisa diklik.
export function HorizontalBars({
  items,
  color,
}: {
  items: { label: string; value: number; to?: string; title?: string }[];
  color: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data</p>;
  const rowClass = "grid grid-cols-[minmax(0,8rem)_1fr_2.5rem] items-center gap-3 rounded-md text-sm";
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const content = (
          <>
            <span className="truncate text-muted-foreground" title={item.title ?? item.label}>
              {item.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-r-[4px] bg-muted">
              <div className="h-full rounded-r-[4px]" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
            </div>
            <span className="text-right font-medium tabular-nums">{item.value}</span>
          </>
        );
        return (
          <li key={item.label}>
            {item.to ? (
              <Link
                to={item.to}
                className={cn(rowClass, "-mx-2 px-2 py-1 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}
              >
                {content}
              </Link>
            ) : (
              <div className={cn(rowClass, "py-1")}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
