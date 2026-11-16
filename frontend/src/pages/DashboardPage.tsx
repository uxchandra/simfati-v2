import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Cog,
  Hourglass,
  PackageX,
  Play,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatPeriod } from "../lib/checkup";
import { MONTHS } from "../lib/schedule";
import { HorizontalBars, MonthlyBars } from "../components/charts";
import type { OuthouseStatus, RepairRequestStatus } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Months = { key: string; tahun: number; bulan: number }[];

type DashboardData =
  | {
      view: "full";
      period: { tahun: number; bulan: number; minggu: number };
      checkup: { dueThisWeek: number; overdue: number; inProgress: number; completedThisMonth: number; ngOpen: number };
      repairRequests: Partial<Record<RepairRequestStatus, number>>;
      stock: { low: number; empty: number };
      assets: { total: number; active: number; byCategory: { id: number; name: string; total: number }[] };
      monthly: { months: Months; checkups: number[]; repairRequests: number[] };
    }
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

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-4 p-4 sm:p-6", className)}>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat dashboard"));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Selamat datang, {user?.name}
          {data?.view === "full" && ` · minggu berjalan ${formatPeriod(data.period)}`}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data ? (
        !error && <p className="py-12 text-center text-muted-foreground">Memuat...</p>
      ) : data.view === "full" ? (
        <>
          <TileGrid
            tiles={[
              {
                label: "Checkup minggu ini",
                value: data.checkup.dueThisWeek,
                icon: CalendarDays,
                to: "/transaksi/general-checkup?tab=current",
                hint: "Jadwal belum dikerjakan",
              },
              {
                label: "Checkup terlambat",
                value: data.checkup.overdue,
                icon: CalendarClock,
                to: "/transaksi/general-checkup?tab=overdue",
                hint: data.checkup.overdue > 0 ? "Perlu segera dikerjakan" : "Tidak ada",
                alert: true,
              },
              {
                label: "NG belum ditutup",
                value: data.checkup.ngOpen,
                icon: AlertTriangle,
                to: "/transaksi/general-checkup?tab=progress",
                hint: data.checkup.ngOpen > 0 ? "Perlu tindakan perbaikan" : "Tidak ada",
                alert: true,
              },
              {
                label: "Checkup berjalan",
                value: data.checkup.inProgress,
                icon: Play,
                to: "/transaksi/general-checkup?tab=progress",
                hint: "Belum selesai / menunggu NG",
              },
              {
                label: "Repair request aktif",
                value: (data.repairRequests.pending ?? 0) + (data.repairRequests.in_progress ?? 0),
                icon: Wrench,
                to: "/transaksi/repair-request",
                hint: `${data.repairRequests.pending ?? 0} menunggu tindakan`,
                alert: (data.repairRequests.pending ?? 0) > 0,
              },
              {
                label: "Checkup selesai bulan ini",
                value: data.checkup.completedThisMonth,
                icon: ClipboardCheck,
                to: "/history/general-checkup?status=completed",
              },
              {
                label: "Stok habis",
                value: data.stock.empty,
                icon: PackageX,
                to: "/sparepart",
                hint: `${data.stock.low} sparepart stok menipis`,
                alert: true,
              },
              {
                label: "Mesin aktif",
                value: data.assets.active,
                icon: Cog,
                hint: `dari ${data.assets.total} aset terdaftar`,
              },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Aktivitas per bulan" subtitle="12 bulan terakhir" className="lg:col-span-2">
              <MonthlyBars
                labels={monthLabels(data.monthly.months)}
                series={[
                  { name: "Checkup selesai", color: "var(--viz-1)", values: data.monthly.checkups },
                  { name: "Repair request", color: "var(--viz-2)", values: data.monthly.repairRequests },
                ]}
              />
            </ChartCard>
            <ChartCard title="Mesin per kategori" subtitle={`${data.assets.total} aset`}>
              <HorizontalBars
                color="var(--viz-1)"
                items={data.assets.byCategory.map((c) => ({ label: c.name, value: c.total }))}
              />
            </ChartCard>
          </div>
        </>
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
          <ChartCard title="Laporan kerusakan saya per bulan" subtitle="12 bulan terakhir">
            <MonthlyBars
              labels={monthLabels(data.monthly.months)}
              series={[{ name: "Repair request", color: "var(--viz-2)", values: data.monthly.repairRequests }]}
            />
          </ChartCard>
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
