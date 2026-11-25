import AndonShell, { EmptyState } from "../components/andon/AndonShell";
import {
  durationShort,
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
  actions: { action: string; problem: string }[];
  noChecksheet?: boolean;
};

type AndonData = {
  counts: { planned: number; overdue: number; inProgress: number; waitingNg: number; completedThisWeek: number };
  rows: Row[];
};

const STATUS: Record<Row["status"], { color: StatusColor; label: string }> = {
  in_progress: { color: "amber", label: "On Progress" },
  waiting_ng: { color: "orange", label: "Tunggu NG" },
  overdue: { color: "red", label: "Delay" },
  planned: { color: "blue", label: "Terjadwal" },
};

// Urutan prioritas: dikerjakan → tunggu NG → delay → terjadwal (seperti v1: on_progress > delay > draft)
const ORDER: Row["status"][] = ["in_progress", "waiting_ng", "overdue", "planned"];

const ACTION_LABEL: Record<string, string> = { ganti_part: "Ganti Part", inhouse: "Inhouse", outhouse: "Outhouse" };

const ROW_HEIGHT = 34;

// Kolom Keterangan: tindakan NG (seperti v1), kalau belum ada tampilkan progres pengisian
function keterangan(r: Row) {
  if (r.actions.length) {
    return r.actions.map((a) => `${ACTION_LABEL[a.action] ?? a.action}, ${a.problem}`).join(" | ");
  }
  if (r.status === "waiting_ng" && r.progress) return `${r.progress.ngOpen} NG belum ditangani`;
  if (r.status === "in_progress" && r.progress) return `Pengisian ${r.progress.filled}/${r.progress.total}`;
  if (r.noChecksheet) return "Tanpa checksheet";
  return "";
}

// Papan andon General Checkup: yang sedang dikerjakan, menunggu penanganan NG, delay, dan jadwal minggu ini
export default function AndonCheckupPage() {
  const { data, error } = useAndonData<AndonData>("/andon/general-checkup");
  const now = useNow();

  const rows = [...(data?.rows ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const { containerRef, visible, page, pages, perPage } = usePaging(rows, ROW_HEIGHT);

  const c = data?.counts;

  return (
    <AndonShell
      title="General Checkup Monitoring"
      error={error}
      page={{ page, pages }}
      summary={[
        { label: "On Progress", value: c?.inProgress ?? 0, color: "amber" },
        { label: "Tunggu NG", value: c?.waitingNg ?? 0, color: "orange" },
        { label: "Delay", value: c?.overdue ?? 0, color: "red", blink: true },
        { label: "Terjadwal", value: c?.planned ?? 0, color: "blue" },
        { label: "Selesai Minggu Ini", value: c?.completedThisWeek ?? 0, color: "green" },
      ]}
    >
      <div ref={containerRef} className="flex h-full flex-col">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={cn(thClass, "w-[3%]")}>No</th>
              <th className={cn(thClass, "w-[9%]")}>Date</th>
              <th className={cn(thClass, "w-[9%]")}>Machine</th>
              <th className={cn(thClass, "w-[8%]")}>Lane</th>
              <th className={cn(thClass, "w-[13%]")}>PIC</th>
              <th className={cn(thClass, "w-[9%]")}>Duration</th>
              <th className={cn(thClass, "w-[10%]")}>Status</th>
              <th className={cn(thClass, "text-left")}>Keterangan</th>
            </tr>
          </thead>
          {rows.length > 0 && (
            <tbody>
              {visible.map((r, i) => {
                const s = STATUS[r.status];
                const overdue = r.status === "overdue";
                const ket = keterangan(r);
                return (
                  <tr key={r.key} className={rowClass} style={{ height: ROW_HEIGHT }}>
                    {/* Delay: garis merah di kiri + tanggal merah (seperti v1) */}
                    <td className={cn(tdClass, overdue && "border-l-4 border-l-[#f87171]")}>
                      {page * perPage + i + 1}
                    </td>
                    <td className={cn(tdClass, overdue && "font-semibold text-[#f87171]")}>
                      {r.jadwal
                        ? `W${r.jadwal.minggu} ${MONTHS[r.jadwal.bulan - 1].slice(0, 3)} ${r.jadwal.tahun}`
                        : ""}
                    </td>
                    <td className={tdClass} title={r.asset.description ?? undefined}>
                      {r.asset.kode}
                    </td>
                    <td className={tdClass}>{r.asset.lane ?? ""}</td>
                    <td className={tdClass}>{r.pic ?? ""}</td>
                    <td className={tdClass}>{r.startedAt ? durationShort(r.startedAt, now) : ""}</td>
                    <td className={cn(tdClass, "tracking-[0.5px]", STATUS_TEXT[s.color])}>{s.label}</td>
                    <td className={cn(tdClass, "text-left")} title={ket || undefined}>
                      {ket}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
        {rows.length === 0 && <EmptyState text={data ? "Tidak ada checkup aktif saat ini" : "Memuat data..."} />}
      </div>
    </AndonShell>
  );
}
