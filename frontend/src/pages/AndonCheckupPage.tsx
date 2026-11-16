import { CheckCircle2 } from "lucide-react";
import AndonShell, { CounterTile, EmptyBoard, StatusPill } from "../components/andon/AndonShell";
import { elapsed, tdClass, thClass, useAndonData, useNow, usePaging, type LampColor } from "../components/andon/andon";
import { MONTHS } from "../lib/schedule";
import { cn } from "@/lib/utils";

type Row = {
  key: string;
  status: "in_progress" | "waiting_ng" | "planned" | "overdue";
  kode: string | null;
  asset: { kode: string; description: string | null; lane: string | null; category: { name: string } };
  jadwal: { tahun: number; bulan: number; minggu: number } | null;
  pic: string | null;
  startedAt: string | null;
  progress: { filled: number; total: number; ngOpen: number } | null;
  noChecksheet?: boolean;
};

type AndonData = {
  period: { tahun: number; bulan: number; minggu: number };
  counts: { planned: number; overdue: number; inProgress: number; waitingNg: number; completedThisWeek: number };
  rows: Row[];
};

const STATUS: Record<Row["status"], { color: LampColor; label: string; blink?: boolean }> = {
  overdue: { color: "red", label: "Terlambat", blink: true },
  in_progress: { color: "amber", label: "Dikerjakan" },
  waiting_ng: { color: "orange", label: "Tunggu NG" },
  planned: { color: "blue", label: "Terjadwal" },
};

const ROW_HEIGHT = 64;

// Papan andon General Checkup: yang sedang dikerjakan, menunggu penanganan NG, terlambat, dan jadwal minggu ini
export default function AndonCheckupPage() {
  const { data, error, updatedAt } = useAndonData<AndonData>("/andon/general-checkup");
  const now = useNow();

  // Urutan tampil: dikerjakan → tunggu NG → terlambat → terjadwal
  const order: Row["status"][] = ["in_progress", "waiting_ng", "overdue", "planned"];
  const rows = [...(data?.rows ?? [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const { containerRef, visible, page, pages, perPage } = usePaging(rows, ROW_HEIGHT);

  const c = data?.counts;
  const subtitle = data
    ? `Minggu ke-${data.period.minggu} · ${MONTHS[data.period.bulan - 1]} ${data.period.tahun} · ${c!.completedThisWeek} selesai minggu ini`
    : "Memuat...";

  return (
    <AndonShell
      title="General Checkup"
      subtitle={subtitle}
      error={error}
      updatedAt={updatedAt}
      page={{ page, pages }}
      legend={[
        { color: "amber", label: "Dikerjakan" },
        { color: "orange", label: "Menunggu penanganan NG" },
        { color: "red", label: "Terlambat" },
        { color: "blue", label: "Terjadwal minggu ini" },
      ]}
      counters={
        <>
          <CounterTile label="Dikerjakan" value={c?.inProgress ?? 0} color="amber" />
          <CounterTile label="Tunggu NG" value={c?.waitingNg ?? 0} color="orange" />
          <CounterTile label="Terlambat" value={c?.overdue ?? 0} color="red" blink />
          <CounterTile label="Minggu ini" value={c?.planned ?? 0} color="blue" />
        </>
      }
    >
      <div ref={containerRef} className="h-full">
        {data && rows.length === 0 ? (
          <EmptyBoard icon={<CheckCircle2 className="size-16 text-emerald-500" />} text="Semua checkup beres" />
        ) : (
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className={cn(thClass, "w-[5%] text-center")}>No</th>
                <th className={cn(thClass, "w-[20%]")}>Mesin</th>
                <th className={cn(thClass, "w-[13%]")}>Kategori</th>
                <th className={cn(thClass, "w-[11%]")}>Jadwal</th>
                <th className={cn(thClass, "w-[15%]")}>Mekanik</th>
                <th className={cn(thClass, "w-[10%]")}>Durasi</th>
                <th className={cn(thClass, "w-[12%]")}>Progres</th>
                <th className={cn(thClass, "w-[14%]")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const s = STATUS[r.status];
                return (
                  <tr key={r.key} style={{ height: ROW_HEIGHT }} className={cn(r.status === "overdue" && "bg-red-950/30")}>
                    <td className={cn(tdClass, "text-center font-mono text-zinc-500")}>{page * perPage + i + 1}</td>
                    <td className={tdClass}>
                      <div className="truncate font-black">{r.asset.kode}</div>
                      <div className="truncate text-[0.65em] font-medium text-zinc-500">
                        {[r.asset.description, r.asset.lane && `Lane ${r.asset.lane}`].filter(Boolean).join(" · ") || r.kode || "-"}
                      </div>
                    </td>
                    <td className={cn(tdClass, "truncate text-zinc-300")}>{r.asset.category.name}</td>
                    <td className={cn(tdClass, "font-mono", r.status === "overdue" ? "text-red-300" : "text-zinc-300")}>
                      {r.jadwal ? `W${r.jadwal.minggu} ${MONTHS[r.jadwal.bulan - 1].slice(0, 3)}` : "-"}
                    </td>
                    <td className={cn(tdClass, "truncate", !r.pic && "text-zinc-600")}>{r.pic ?? "—"}</td>
                    <td className={cn(tdClass, "font-mono tabular-nums", r.startedAt ? "text-amber-200" : "text-zinc-600")}>
                      {r.startedAt ? elapsed(r.startedAt, now) : "—"}
                    </td>
                    <td className={tdClass}>
                      {r.progress ? (
                        r.status === "waiting_ng" ? (
                          <span className="font-mono text-orange-300">{r.progress.ngOpen} NG terbuka</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-amber-400 transition-[width] duration-700"
                                style={{ width: `${(r.progress.filled / Math.max(1, r.progress.total)) * 100}%` }}
                              />
                            </div>
                            <span className="font-mono text-[0.75em] text-zinc-300 tabular-nums">
                              {r.progress.filled}/{r.progress.total}
                            </span>
                          </div>
                        )
                      ) : r.noChecksheet ? (
                        <span className="text-[0.75em] text-zinc-500">Tanpa checksheet</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <StatusPill color={s.color} label={s.label} blink={s.blink} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AndonShell>
  );
}
