import { Fragment } from "react";
import AndonShell, { EmptyState } from "../components/andon/AndonShell";
import {
  durationShort,
  formatDateDMY,
  rowClass,
  STATUS_TEXT,
  tableClass,
  tdClass,
  thClass,
  useAndonData,
  useNow,
  usePaging,
  type StatusColor,
} from "../components/andon/andon";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  kode: string;
  problem: string;
  board: "waiting" | "repair" | "subcont";
  requestedAt: string;
  asset: { kode: string; description: string | null; lane: string | null; category: { name: string } };
  requestedBy: { name: string };
  rootCause: string | null;
  countermeasure: string | null;
  pic: string | null;
};

type AndonData = {
  counts: { waiting: number; repair: number; subcont: number; completedToday: number };
  rows: Row[];
};

// Warna status mengikuti v1: open kuning, in progress biru, (subcont ungu seperti on trial)
const STATUS: Record<Row["board"], { color: StatusColor; label: string }> = {
  waiting: { color: "amber", label: "Open" },
  repair: { color: "blue", label: "In Progress" },
  subcont: { color: "purple", label: "Subcont" },
};

const ORDER: Row["board"][] = ["waiting", "repair", "subcont"];

const ROW_HEIGHT = 34;

// Papan andon Repair Request: kerusakan yang belum selesai, dengan durasi sejak dilaporkan
export default function AndonRepairPage() {
  const { data, error } = useAndonData<AndonData>("/andon/repair-request");
  const now = useNow();

  // Yang belum ditangani di atas; di dalam status yang sama, yang terlama dulu (urutan dari backend)
  const rows = [...(data?.rows ?? [])].sort((a, b) => ORDER.indexOf(a.board) - ORDER.indexOf(b.board));
  const { containerRef, visible, page, pages, perPage } = usePaging(rows, ROW_HEIGHT);

  // Teks berjalan: pelapor | mesin | problem | status (seperti v1)
  const ticker =
    data && rows.length === 0 ? (
      <>&nbsp;&nbsp;&nbsp;✅&nbsp;Tidak ada repair aktif saat ini.</>
    ) : (
      rows.map((r) => (
        <Fragment key={r.id}>
          &nbsp;&nbsp;{r.requestedBy.name}&nbsp;|&nbsp;{r.asset.kode}&nbsp;|&nbsp;{r.problem}&nbsp;|&nbsp;
          {STATUS[r.board].label}&nbsp;&nbsp;&nbsp;•
        </Fragment>
      ))
    );

  const c = data?.counts;

  return (
    <AndonShell
      title="Repair Request Monitoring"
      error={error}
      page={{ page, pages }}
      ticker={data ? ticker : null}
      summary={[
        { label: "Open", value: c?.waiting ?? 0, color: "amber", blink: true },
        { label: "In Progress", value: c?.repair ?? 0, color: "blue" },
        { label: "Subcont", value: c?.subcont ?? 0, color: "purple" },
        { label: "Selesai Hari Ini", value: c?.completedToday ?? 0, color: "green" },
      ]}
    >
      <div ref={containerRef} className="flex h-full flex-col">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={cn(thClass, "w-[3%]")}>No</th>
              <th className={cn(thClass, "w-[10%]")}>Req. From</th>
              <th className={cn(thClass, "w-[7%]")}>Date</th>
              <th className={cn(thClass, "w-[7%]")}>Machine</th>
              <th className={cn(thClass, "w-[6%]")}>Area</th>
              <th className={cn(thClass, "w-[20%] text-left")}>Problem</th>
              <th className={cn(thClass, "w-[17%] text-left")}>Root Cause</th>
              <th className={cn(thClass, "w-[15%] text-left")}>Counterm</th>
              <th className={cn(thClass, "w-[7%]")}>Status</th>
              <th className={cn(thClass, "w-[6%]")}>PIC</th>
              <th className={cn(thClass, "w-[5%]")}>Dur.</th>
            </tr>
          </thead>
          {rows.length > 0 && (
            <tbody>
              {visible.map((r, i) => {
                const s = STATUS[r.board];
                return (
                  <tr key={r.id} className={rowClass} style={{ height: ROW_HEIGHT }}>
                    <td className={tdClass}>{page * perPage + i + 1}</td>
                    <td className={tdClass}>{r.requestedBy.name}</td>
                    <td className={tdClass}>{formatDateDMY(r.requestedAt)}</td>
                    <td className={tdClass} title={r.asset.description ?? undefined}>
                      {r.asset.kode}
                    </td>
                    <td className={tdClass}>{r.asset.lane ?? r.asset.category.name}</td>
                    <td className={cn(tdClass, "text-left")} title={r.problem}>
                      {r.problem}
                    </td>
                    <td className={cn(tdClass, "text-left")} title={r.rootCause ?? undefined}>
                      {r.rootCause ?? ""}
                    </td>
                    <td className={cn(tdClass, "text-left")} title={r.countermeasure ?? undefined}>
                      {r.countermeasure ?? ""}
                    </td>
                    <td className={cn(tdClass, "tracking-[0.5px]", STATUS_TEXT[s.color])}>{s.label}</td>
                    <td className={tdClass}>{r.pic ?? ""}</td>
                    <td className={tdClass} title="Durasi sejak dilaporkan">
                      {durationShort(r.requestedAt, now)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
        {rows.length === 0 && <EmptyState text={data ? "Tidak ada repair aktif saat ini" : "Memuat data..."} />}
      </div>
    </AndonShell>
  );
}
