import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cog,
  Hourglass,
  Play,
  Tv,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDuration, formatPeriod, OUTHOUSE_LABEL, RR_STATUS_CLASS, RR_STATUS_LABEL } from "../lib/checkup";
import { MONTHS } from "../lib/schedule";
import { HorizontalBars, MonthlyBars } from "../components/charts";
import type { OuthouseStatus, RepairAction, RepairRequestStatus } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Months = { key: string; tahun: number; bulan: number }[];
type Period = { tahun: number; bulan: number; minggu: number };
type AgendaStatus = "pending" | "on_progress" | "completed";

type FullDashboard = {
  view: "full";
  period: Period;
  checkup: {
    planWeek: number;
    completedWeek: number;
    inProgressWeek: number;
    notStartedWeek: number;
    agenda: {
      scheduleId: number;
      checkupId: number | null;
      kode: string;
      description: string | null;
      category: string;
      pic: string;
      status: AgendaStatus;
      result: "OK" | "NG" | null;
    }[];
    overdueCount: number;
    overdue: { scheduleId: number; kode: string; description: string | null; period: Period; weeksLate: number }[];
    onProgressCount: number;
    upcoming: (Period & { total: number })[];
    compliancePct: number | null;
    doneThisMonth: number;
    missedThisMonth: number;
  };
  repair: {
    active: {
      id: number;
      kode: string;
      problem: string;
      status: RepairRequestStatus;
      repairAction: RepairAction | null;
      requestedAt: string;
      asset: { kode: string; description: string | null };
      requestedBy: { name: string };
    }[];
    pending: number;
    inProgress: number;
    newToday: number;
    completedThisMonth: number;
    avgResolutionMinutes: number | null;
    waitingPart: number;
  };
  machine: { total: number; active: number; inactive: number; inRepair: number };
  sparepart: {
    lowCount: number;
    emptyCount: number;
    lowItems: { id: string; kodeBarang: string; namaBarang: string | null; stok: number; minimalStok: number; uom: string | null }[];
  };
  subcont: {
    count: number;
    items: {
      id: number;
      subcont: string;
      machine: string;
      problem: string;
      status: OuthouseStatus;
      startedAt: string | null;
      repairRequestId: number | null;
      checkupId: number | null;
    }[];
  };
  topTroubleMachines: { assetId: number; kode: string; description: string | null; total: number }[];
  trend: { months: Months; checkups: number[]; repairRequests: number[] };
  checkupResult: { ok: number; ng: number };
};

type DashboardData =
  | FullDashboard
  | {
      view: "leader";
      repairRequests: Partial<Record<RepairRequestStatus, number>>;
      picMachines: number;
      monthly: { months: Months; repairRequests: number[] };
    }
  | { view: "subcont"; outhouse: Partial<Record<OuthouseStatus, number>> };

// Label bulan singkat untuk sumbu: "Nov", atau "Jan 26" di awal tahun
const monthLabels = (months: Months) =>
  months.map((m, i) => {
    const short = MONTHS[m.bulan - 1].slice(0, 3);
    return i === 0 || m.bulan === 1 ? `${short} ${String(m.tahun).slice(2)}` : short;
  });

const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
};

// "3 hari 2 jam" dari jumlah menit
const humanMinutes = (minutes: number) => formatDuration(new Date(0).toISOString(), new Date(minutes * 60000).toISOString());

const AGENDA_STATUS: Record<AgendaStatus, [string, string]> = {
  pending: ["Belum mulai", "bg-muted text-muted-foreground"],
  on_progress: ["Dikerjakan", "bg-sky-500/15 text-sky-700 dark:text-sky-300"],
  completed: ["Selesai", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"],
};

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

// ================= Komponen kecil =================

type Tile = {
  label: string;
  value: number;
  icon: LucideIcon;
  to?: string;
  hint?: string;
  // Tampilkan sebagai peringatan kalau nilainya > 0 (selalu disertai ikon + teks, bukan warna saja)
  alert?: boolean;
};

function StatTile({ tile }: { tile: Tile }) {
  const warn = tile.alert && tile.value > 0;
  const body = (
    <Card
      className={cn(
        "h-full flex-row items-start gap-3 p-4 transition-colors",
        tile.to && "hover:bg-muted/50",
        warn && "border-destructive/40",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          warn ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        <tile.icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{tile.label}</p>
        <p className="text-2xl font-semibold tabular-nums">{tile.value.toLocaleString("id-ID")}</p>
        {tile.hint && <p className={cn("text-xs", warn ? "text-destructive" : "text-muted-foreground")}>{tile.hint}</p>}
      </div>
    </Card>
  );
  return tile.to ? (
    <Link to={tile.to} className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <StatTile key={t.label} tile={t} />
      ))}
    </div>
  );
}

// Bungkus kartu jadi link kalau `to` diisi (hover + fokus keyboard)
function CardLink({ to, children }: { to?: string; children: ReactNode }) {
  if (!to) return children;
  return (
    <Link
      to={to}
      className="group block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none *:data-[slot=card]:h-full *:data-[slot=card]:transition-colors *:data-[slot=card]:hover:bg-muted/50"
    >
      {children}
    </Link>
  );
}

// Panah kecil di pojok kartu yang bisa diklik
const LinkHint = () => (
  <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
);

// KPI utama: angka besar, opsional "/ total" dan progress bar
function KpiCard({
  label,
  icon: Icon,
  value,
  total,
  progress,
  warn,
  to,
  children,
}: {
  label: string;
  icon: LucideIcon;
  value: number;
  total?: number;
  progress?: number;
  warn?: boolean;
  to?: string;
  children?: ReactNode;
}) {
  return (
    <CardLink to={to}>
    <Card className={cn("gap-2 p-5", warn && "border-destructive/40")}>
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {label} {to && <LinkHint />}
        </p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            warn ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("text-3xl font-bold tabular-nums", warn && "text-destructive")}>
        {value.toLocaleString("id-ID")}
        {total !== undefined && <span className="text-lg font-semibold text-muted-foreground"> / {total.toLocaleString("id-ID")}</span>}
      </p>
      {progress !== undefined && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="text-xs text-muted-foreground">{children}</div>
    </Card>
    </CardLink>
  );
}

function MiniKpi({
  label,
  value,
  warn,
  to,
  children,
}: {
  label: string;
  value: ReactNode;
  warn?: boolean;
  to?: string;
  children: ReactNode;
}) {
  return (
    <CardLink to={to}>
      <Card className="gap-1 px-5 py-4">
        <p className="inline-flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label} {to && <LinkHint />}
        </p>
        <p className={cn("text-2xl font-bold tabular-nums", warn && "text-destructive")}>{value}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </Card>
    </CardLink>
  );
}

// Baris tabel yang bisa diklik di mana saja (link di dalamnya tetap untuk keyboard / buka tab baru)
function useRowLink() {
  const navigate = useNavigate();
  return (to: string) => ({
    onClick: (e: React.MouseEvent) => {
      // Klik pada link di dalam baris sudah ditangani link itu sendiri
      if ((e.target as HTMLElement).closest("a")) return;
      navigate(to);
    },
    className: "cursor-pointer hover:bg-muted/50",
  });
}

function Panel({
  title,
  subtitle,
  link,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  link?: { to: string; label?: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {link && (
          <Link to={link.to} className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline">
            {link.label ?? "Buka"} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

function Empty({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="size-8 text-muted-foreground/40" />}
      <p>{children}</p>
    </div>
  );
}

const Pill = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>{children}</span>
);

// ================= Dashboard Super Admin & Mekanik =================

function FullView({ data }: { data: FullDashboard }) {
  const { checkup, repair, machine, sparepart, subcont } = data;
  // Waktu saat dashboard dimuat, untuk menandai repair yang menunggu > 1 hari
  const [loadedAt] = useState(() => Date.now());
  const rowLink = useRowLink();
  const machineOk = machine.total - machine.inRepair;
  const maxUpcoming = Math.max(1, ...checkup.upcoming.map((u) => u.total));
  const resultTotal = data.checkupResult.ok + data.checkupResult.ng;

  const alerts: ReactNode[] = [];
  const alertLink = "font-semibold underline underline-offset-2 hover:no-underline";
  if (checkup.overdueCount > 0)
    alerts.push(
      <>
        <Link to="/transaksi/general-checkup?tab=overdue" className={alertLink}>
          {checkup.overdueCount} jadwal checkup delay
        </Link>{" "}
        belum dikerjakan
      </>,
    );
  if (repair.pending > 0)
    alerts.push(
      <>
        <Link to="/transaksi/repair-request?status=pending" className={alertLink}>
          {repair.pending} repair request
        </Link>{" "}
        belum ditangani
      </>,
    );
  if (sparepart.emptyCount > 0)
    alerts.push(
      <>
        <Link to="/sparepart?status=habis" className={alertLink}>
          {sparepart.emptyCount} sparepart
        </Link>{" "}
        stoknya habis
      </>,
    );

  return (
    <>
      {alerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            <p>
              Perlu perhatian:{" "}
              {alerts.map((a, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {a}
                </span>
              ))}
              .
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* ===== KPI utama ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Checkup Minggu Ini"
          icon={ClipboardCheck}
          value={checkup.completedWeek}
          total={checkup.planWeek}
          progress={pct(checkup.completedWeek, checkup.planWeek)}
          to="/transaksi/general-checkup?tab=current"
        >
          {checkup.inProgressWeek} dikerjakan · {checkup.notStartedWeek} belum mulai
        </KpiCard>
        <KpiCard
          label="Checkup Delay"
          icon={Clock}
          value={checkup.overdueCount}
          warn={checkup.overdueCount > 0}
          to="/transaksi/general-checkup?tab=overdue"
        >
          {checkup.onProgressCount > 0 ? `${checkup.onProgressCount} menunggu perbaikan NG` : "Lewat jatuh tempo"}
        </KpiCard>
        <KpiCard label="Repair Aktif" icon={Wrench} value={repair.active.length} to="/transaksi/repair-request?status=pending">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <Pill className={RR_STATUS_CLASS.pending}>Menunggu {repair.pending}</Pill>
            <Pill className={RR_STATUS_CLASS.in_progress}>Dikerjakan {repair.inProgress}</Pill>
          </div>
          {repair.newToday} request baru hari ini
        </KpiCard>
        <KpiCard
          label="Mesin Beroperasi Normal"
          icon={Cog}
          value={machineOk}
          total={machine.total}
          progress={pct(machineOk, machine.total)}
          to={machine.inRepair > 0 ? "/transaksi/repair-request?status=in_progress" : undefined}
        >
          {machine.inRepair} sedang repair
          {machine.inactive > 0 && ` · ${machine.inactive} nonaktif`}
        </KpiCard>
      </div>

      {/* ===== KPI sekunder ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MiniKpi
          label="Pencapaian PM Bulan Ini"
          value={checkup.compliancePct !== null ? `${checkup.compliancePct}%` : "-"}
          warn={checkup.compliancePct !== null && checkup.compliancePct < 80}
          to={checkup.missedThisMonth > 0 ? "/transaksi/general-checkup?tab=overdue" : "/history/general-checkup"}
        >
          {checkup.doneThisMonth} dikerjakan · {checkup.missedThisMonth} terlewat
        </MiniKpi>
        <MiniKpi label="Repair Selesai Bulan Ini" value={repair.completedThisMonth} to="/transaksi/repair-request?status=completed">
          Rata-rata penyelesaian: {repair.avgResolutionMinutes !== null ? humanMinutes(repair.avgResolutionMinutes) : "-"}
        </MiniKpi>
        <MiniKpi
          label="Menunggu Part / Subcont"
          to="/transaksi/repair-request?status=in_progress"
          value={
            <>
              {repair.waitingPart} <span className="text-base font-semibold text-muted-foreground">/ {subcont.count}</span>
            </>
          }
        >
          Part belum terpasang · perbaikan di subcont
        </MiniKpi>
        <MiniKpi label="Stok Sparepart Menipis" value={sparepart.lowCount} warn={sparepart.lowCount > 0} to="/sparepart?status=low">
          {sparepart.emptyCount} item stok habis
        </MiniKpi>
      </div>

      {/* ===== Agenda minggu ini + minggu ke depan ===== */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title="Agenda Checkup Minggu Ini"
          subtitle={`Jadwal preventive ${formatPeriod(data.period)} & checkup yang sedang/sudah dikerjakan`}
          link={{ to: "/transaksi/general-checkup" }}
          className="xl:col-span-2"
        >
          <div className="max-h-96 overflow-auto">
            {checkup.agenda.length === 0 ? (
              <Empty icon={CalendarCheck}>Tidak ada jadwal checkup minggu ini.</Empty>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-5 py-2 font-medium">Mesin</th>
                    <th className="px-3 py-2 font-medium">Kategori</th>
                    <th className="px-3 py-2 font-medium">PIC</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Hasil</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {checkup.agenda.map((row) => {
                    const [label, cls] = AGENDA_STATUS[row.status];
                    return (
                      <tr
                        key={row.scheduleId}
                        {...rowLink(row.checkupId ? `/transaksi/general-checkup/${row.checkupId}` : "/transaksi/general-checkup?tab=current")}
                      >
                        <td className="px-5 py-2.5">
                          {row.checkupId ? (
                            <Link to={`/transaksi/general-checkup/${row.checkupId}`} className="font-mono font-semibold text-primary hover:underline">
                              {row.kode}
                            </Link>
                          ) : (
                            <p className="font-mono font-semibold">{row.kode}</p>
                          )}
                          <p className="line-clamp-1 text-xs text-muted-foreground">{row.description}</p>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.category}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.pic}</td>
                        <td className="px-3 py-2.5">
                          <Pill className={cls}>{label}</Pill>
                        </td>
                        <td className="px-5 py-2.5 text-xs font-semibold">
                          {row.result === "OK" ? (
                            <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                          ) : row.result === "NG" ? (
                            <span className="text-amber-600 dark:text-amber-400">NG</span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {checkup.overdueCount > 0 && (
            <div className="border-t border-destructive/20 bg-destructive/5 px-5 py-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-destructive">
                <Clock className="size-3.5" /> Delay ({checkup.overdueCount})
              </p>
              <div className="flex flex-wrap gap-2">
                {checkup.overdue.map((row) => (
                  <Link
                    key={row.scheduleId}
                    to="/transaksi/general-checkup?tab=overdue"
                    title={`${row.description ?? row.kode} — jadwal ${formatPeriod(row.period)}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2 py-1 text-xs hover:bg-muted"
                  >
                    <span className="font-mono font-semibold">{row.kode}</span>
                    <span className="text-destructive">+{row.weeksLate} mg</span>
                  </Link>
                ))}
                {checkup.overdueCount > checkup.overdue.length && (
                  <Link to="/transaksi/general-checkup?tab=overdue" className="px-2 py-1 text-xs text-destructive hover:underline">
                    +{checkup.overdueCount - checkup.overdue.length} lainnya
                  </Link>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Jadwal 4 Minggu ke Depan"
          subtitle={`${checkup.upcoming.reduce((n, u) => n + u.total, 0)} checkup preventive terjadwal`}
        >
          <ul className="space-y-3 p-5">
            {checkup.upcoming.map((u) => (
              <li key={`${u.tahun}-${u.bulan}-${u.minggu}`} className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <p className="text-sm font-medium">W{u.minggu}</p>
                  <p className="text-xs text-muted-foreground">
                    {MONTHS[u.bulan - 1].slice(0, 3)} {u.tahun}
                  </p>
                </div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${(u.total / maxUpcoming) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{u.total}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ===== Repair aktif + mesin paling bermasalah ===== */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title="Repair Request Aktif"
          subtitle="Diurutkan dari yang paling lama menunggu"
          link={{ to: "/transaksi/repair-request" }}
          className="xl:col-span-2"
        >
          <div className="max-h-96 overflow-auto">
            {repair.active.length === 0 ? (
              <Empty icon={CheckCircle2}>Tidak ada repair request yang aktif.</Empty>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-5 py-2 font-medium">Request</th>
                    <th className="px-3 py-2 font-medium">Mesin</th>
                    <th className="px-3 py-2 font-medium">Masalah</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 text-right font-medium">Sejak</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {repair.active.map((rr) => {
                    const waitMinutes = (loadedAt - new Date(rr.requestedAt).getTime()) / 60000;
                    return (
                      <tr key={rr.id} {...rowLink(`/transaksi/repair-request/${rr.id}`)}>
                        <td className="px-5 py-2.5">
                          <Link to={`/transaksi/repair-request/${rr.id}`} className="font-mono font-semibold text-primary hover:underline">
                            {rr.kode}
                          </Link>
                          <p className="text-xs text-muted-foreground">oleh {rr.requestedBy.name}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-mono">{rr.asset.kode}</p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">{rr.asset.description}</p>
                        </td>
                        <td className="max-w-xs px-3 py-2.5 text-muted-foreground">
                          <p className="line-clamp-2" title={rr.problem}>
                            {rr.problem}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <Pill className={RR_STATUS_CLASS[rr.status]}>{RR_STATUS_LABEL[rr.status]}</Pill>
                        </td>
                        <td
                          className={cn(
                            "px-5 py-2.5 text-right whitespace-nowrap",
                            waitMinutes > 1440 ? "font-semibold text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {formatDuration(rr.requestedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Panel>

        <Panel title="Mesin Paling Sering Repair" subtitle="90 hari terakhir">
          {data.topTroubleMachines.length === 0 ? (
            <Empty>Belum ada data repair.</Empty>
          ) : (
            <div className="p-5">
              <HorizontalBars
                color="var(--viz-2)"
                items={data.topTroubleMachines.map((m) => ({
                  label: m.kode,
                  value: m.total,
                  title: m.description ?? m.kode,
                  to: `/transaksi/repair-request?status=completed&search=${encodeURIComponent(m.kode)}`,
                }))}
              />
            </div>
          )}
        </Panel>
      </div>

      {/* ===== Grafik ===== */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Tren 12 Bulan: Checkup vs Repair Request" className="xl:col-span-2">
          <div className="p-5">
            <MonthlyBars
              labels={monthLabels(data.trend.months)}
              series={[
                { name: "General Checkup", color: "var(--viz-1)", values: data.trend.checkups },
                { name: "Repair Request", color: "var(--viz-2)", values: data.trend.repairRequests },
              ]}
            />
          </div>
        </Panel>
        <Panel title="Hasil Checkup 30 Hari" subtitle="NG = ada minimal satu poin NG">
          {resultTotal === 0 ? (
            <Empty>Belum ada checkup dalam 30 hari terakhir.</Empty>
          ) : (
            <div className="space-y-4 p-5">
              <p className="text-3xl font-bold tabular-nums">
                {resultTotal} <span className="text-base font-medium text-muted-foreground">checkup disubmit</span>
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-emerald-500" style={{ width: `${pct(data.checkupResult.ok, resultTotal)}%` }} />
                <div className="h-full bg-amber-500" style={{ width: `${pct(data.checkupResult.ng, resultTotal)}%` }} />
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-emerald-500" /> OK
                  <span className="ml-auto font-semibold tabular-nums">{data.checkupResult.ok}</span>
                  <span className="w-10 text-right text-muted-foreground tabular-nums">{pct(data.checkupResult.ok, resultTotal)}%</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-amber-500" /> NG
                  <span className="ml-auto font-semibold tabular-nums">{data.checkupResult.ng}</span>
                  <span className="w-10 text-right text-muted-foreground tabular-nums">{pct(data.checkupResult.ng, resultTotal)}%</span>
                </li>
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* ===== Stok kritis + subcont ===== */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Stok Sparepart Kritis"
          subtitle="Stok di bawah / sama dengan minimal stok"
          link={{ to: "/sparepart", label: "Lihat semua" }}
        >
          {sparepart.lowItems.length === 0 ? (
            <Empty>Semua stok sparepart aman.</Empty>
          ) : (
            <ul className="divide-y">
              {sparepart.lowItems.map((sp) => (
                <li key={sp.id}>
                  <Link
                    to={`/sparepart?search=${encodeURIComponent(sp.kodeBarang)}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{sp.namaBarang ?? "-"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{sp.kodeBarang}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-sm font-semibold", sp.stok <= 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
                      {sp.stok} {sp.uom}
                    </p>
                    <p className="text-xs text-muted-foreground">min. {sp.minimalStok}</p>
                  </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Perbaikan di Subcont" subtitle={`${subcont.count} perbaikan outhouse belum selesai`}>
          {subcont.items.length === 0 ? (
            <Empty>Tidak ada perbaikan di subcont.</Empty>
          ) : (
            <ul className="divide-y">
              {subcont.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={
                      item.repairRequestId
                        ? `/transaksi/repair-request/${item.repairRequestId}`
                        : item.checkupId
                          ? `/transaksi/general-checkup/${item.checkupId}`
                          : "/transaksi/general-checkup?tab=progress"
                    }
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-mono font-semibold">{item.machine}</span> · {item.subcont}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.problem}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-right text-xs",
                      item.startedAt ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {item.startedAt ? formatDuration(item.startedAt) : OUTHOUSE_LABEL[item.status]}
                  </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

// ================= Halaman =================

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat dashboard"));
  }, []);

  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="text-2xl font-bold">
            {greeting()}, {user?.name}
          </h1>
        </div>
        {data?.view === "full" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/andon/general-checkup" target="_blank" rel="noopener noreferrer">
                <Tv /> Andon Checkup
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/andon/repair-request" target="_blank" rel="noopener noreferrer">
                <Wrench /> Andon Repair
              </Link>
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data ? (
        !error && <p className="py-12 text-center text-muted-foreground">Memuat...</p>
      ) : data.view === "full" ? (
        <FullView data={data} />
      ) : data.view === "leader" ? (
        <>
          <TileGrid
            tiles={[
              {
                label: "Menunggu tindakan",
                value: data.repairRequests.pending ?? 0,
                icon: Hourglass,
                to: "/transaksi/repair-request?status=pending",
              },
              {
                label: "Sedang dikerjakan",
                value: data.repairRequests.in_progress ?? 0,
                icon: Wrench,
                to: "/transaksi/repair-request?status=in_progress",
              },
              {
                label: "Selesai",
                value: data.repairRequests.completed ?? 0,
                icon: CheckCircle2,
                to: "/transaksi/repair-request?status=completed",
              },
              { label: "Mesin PIC saya", value: data.picMachines, icon: Cog, hint: "Mesin yang bisa Anda laporkan" },
            ]}
          />
          <Card className="gap-4 p-4 sm:p-6">
            <div>
              <h2 className="font-semibold">Laporan kerusakan saya per bulan</h2>
              <p className="text-xs text-muted-foreground">12 bulan terakhir</p>
            </div>
            <MonthlyBars
              labels={monthLabels(data.monthly.months)}
              series={[{ name: "Repair request", color: "var(--viz-2)", values: data.monthly.repairRequests }]}
            />
          </Card>
        </>
      ) : (
        <TileGrid
          tiles={[
            { label: "Menunggu dimulai", value: data.outhouse.pending ?? 0, icon: Hourglass, to: "/subcont/repair", alert: true, hint: "Perbaikan baru" },
            { label: "Sedang dikerjakan", value: data.outhouse.on_progress ?? 0, icon: Play, to: "/subcont/repair" },
            {
              label: "Menunggu konfirmasi",
              value: data.outhouse.waiting_confirmation ?? 0,
              icon: Building2,
              to: "/subcont/repair",
              hint: "Menunggu dicek mekanik",
            },
            { label: "Selesai", value: data.outhouse.completed ?? 0, icon: CheckCircle2, to: "/subcont/repair?view=history" },
          ]}
        />
      )}
    </div>
  );
}
