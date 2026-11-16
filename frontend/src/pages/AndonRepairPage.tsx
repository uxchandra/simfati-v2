import { ShieldCheck } from "lucide-react";
import AndonShell, { CounterTile, EmptyBoard, StatusPill } from "../components/andon/AndonShell";
import { elapsed, tdClass, thClass, useAndonData, useNow, usePaging, type LampColor } from "../components/andon/andon";
import { ACTION_LABEL, OUTHOUSE_LABEL } from "../lib/checkup";
import type { OuthouseStatus, RepairAction } from "../types";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  kode: string;
  problem: string;
  status: "pending" | "in_progress";
  board: "waiting" | "repair" | "subcont";
  repairAction: RepairAction | null;
  requestedAt: string;
  asset: { kode: string; description: string | null; lane: string | null; category: { name: string } };
  requestedBy: { name: string };
  outhouseRepair: { status: OuthouseStatus; subcont: { nama: string } } | null;
  parts: { installed: number; total: number } | null;
};

type AndonData = {
  counts: { waiting: number; repair: number; subcont: number; completedToday: number };
  rows: Row[];
};

const STATUS: Record<Row["board"], { color: LampColor; label: string; blink?: boolean }> = {
  waiting: { color: "red", label: "Menunggu", blink: true },
  repair: { color: "amber", label: "Perbaikan" },
  subcont: { color: "blue", label: "Di Subcont" },
};

const ROW_HEIGHT = 72;

// Downtime > 4 jam ditandai merah, > 1 jam kuning
function downtimeClass(from: string, now: Date) {
  const hours = (now.getTime() - new Date(from).getTime()) / 3_600_000;
  if (hours >= 4) return "text-red-300";
  if (hours >= 1) return "text-amber-200";
  return "text-zinc-200";
}

// Papan andon Repair Request: kerusakan yang menunggu tindakan & sedang diperbaiki, dengan downtime berjalan
export default function AndonRepairPage() {
  const { data, error, updatedAt } = useAndonData<AndonData>("/andon/repair-request");
  const now = useNow();

  // Menunggu tindakan selalu di atas, lalu yang terlama
  const order: Row["board"][] = ["waiting", "repair", "subcont"];
  const rows = [...(data?.rows ?? [])].sort((a, b) => order.indexOf(a.board) - order.indexOf(b.board));
  const { containerRef, visible, page, pages } = usePaging(rows, ROW_HEIGHT);
  const c = data?.counts;

  return (
    <AndonShell
      title="Repair Request"
      subtitle={data ? `${rows.length} kerusakan aktif · ${c!.completedToday} selesai hari ini` : "Memuat..."}
      error={error}
      updatedAt={updatedAt}
      page={{ page, pages }}
      legend={[
        { color: "red", label: "Menunggu tindakan mekanik" },
        { color: "amber", label: "Perbaikan internal / ganti part" },
        { color: "blue", label: "Dikerjakan subcont" },
      ]}
      counters={
        <>
          <CounterTile label="Menunggu" value={c?.waiting ?? 0} color="red" blink />
          <CounterTile label="Perbaikan" value={c?.repair ?? 0} color="amber" />
          <CounterTile label="Di Subcont" value={c?.subcont ?? 0} color="blue" />
          <CounterTile label="Selesai hari ini" value={c?.completedToday ?? 0} color="green" />
        </>
      }
    >
      <div ref={containerRef} className="h-full">
        {data && rows.length === 0 ? (
          <EmptyBoard icon={<ShieldCheck className="size-16 text-emerald-500" />} text="Tidak ada kerusakan aktif" />
        ) : (
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className={cn(thClass, "w-[12%]")}>Kode</th>
                <th className={cn(thClass, "w-[16%]")}>Mesin</th>
                <th className={cn(thClass, "w-[25%]")}>Problem</th>
                <th className={cn(thClass, "w-[12%]")}>Pelapor</th>
                <th className={cn(thClass, "w-[10%]")}>Downtime</th>
                <th className={cn(thClass, "w-[13%]")}>Tindakan</th>
                <th className={cn(thClass, "w-[12%]")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const s = STATUS[r.board];
                const reported = new Date(r.requestedAt);
                return (
                  <tr key={r.id} style={{ height: ROW_HEIGHT }} className={cn(r.board === "waiting" && "bg-red-950/30")}>
                    <td className={cn(tdClass, "font-mono text-[0.8em] text-zinc-300")}>{r.kode}</td>
                    <td className={tdClass}>
                      <div className="truncate font-black">{r.asset.kode}</div>
                      <div className="truncate text-[0.65em] font-medium text-zinc-500">
                        {[r.asset.lane && `Lane ${r.asset.lane}`, r.asset.category.name].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className={tdClass}>
                      <p className="line-clamp-2 text-[0.85em] leading-snug font-medium text-zinc-200">{r.problem}</p>
                    </td>
                    <td className={tdClass}>
                      <div className="truncate">{r.requestedBy.name}</div>
                      <div className="font-mono text-[0.65em] text-zinc-500">
                        {String(reported.getHours()).padStart(2, "0")}:{String(reported.getMinutes()).padStart(2, "0")}{" "}
                        {reported.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                      </div>
                    </td>
                    <td className={cn(tdClass, "font-mono font-black tabular-nums", downtimeClass(r.requestedAt, now))}>
                      {elapsed(r.requestedAt, now)}
                    </td>
                    <td className={tdClass}>
                      {r.repairAction ? (
                        <>
                          <div className="truncate text-[0.85em]">{ACTION_LABEL[r.repairAction]}</div>
                          <div className="truncate text-[0.65em] font-medium text-zinc-500">
                            {r.outhouseRepair
                              ? `${r.outhouseRepair.subcont.nama} · ${OUTHOUSE_LABEL[r.outhouseRepair.status]}`
                              : r.parts
                                ? `${r.parts.installed}/${r.parts.total} part terpasang`
                                : "Internal"}
                          </div>
                        </>
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
