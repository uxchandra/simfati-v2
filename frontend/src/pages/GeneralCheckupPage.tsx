import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ClipboardCheck, Play } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { formatDateTime, formatDuration, formatPeriod } from "../lib/checkup";
import CheckupStatusBadge from "../components/CheckupStatusBadge";
import type { CheckupBoard, CheckupSummary, DueCheckup, KategoriAset } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Tab = "progress" | "current" | "overdue";
const TABS: Tab[] = ["progress", "current", "overdue"];

export default function GeneralCheckupPage() {
  const navigate = useNavigate();
  // Tab disimpan di URL (?tab=) supaya tidak ter-reset saat kembali dari halaman checkup
  const [searchParams, setSearchParams] = useSearchParams();

  const [board, setBoard] = useState<CheckupBoard | null>(null);
  const [categories, setCategories] = useState<KategoriAset[]>([]);
  const [categoryId, setCategoryId] = useState("all");
  const [error, setError] = useState("");

  // Konfirmasi mulai checkup: null = tertutup
  const [starting, setStarting] = useState<DueCheckup | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function loadData() {
    const params = categoryId === "all" ? "" : `?categoryId=${categoryId}`;
    return api<CheckupBoard>(`/general-checkups${params}`)
      .then(setBoard)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data checkup"));
  }

  useEffect(() => {
    api<KategoriAset[]>("/kategori-aset/all").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [categoryId]);

  async function handleStart(item: DueCheckup) {
    setSubmitting(true);
    try {
      const res = await api<{ id: number }>("/general-checkups/start", {
        method: "POST",
        body: JSON.stringify({ scheduleId: item.scheduleId }),
      });
      navigate(`/transaksi/general-checkup/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulai checkup");
      setStarting(null);
      loadData();
    } finally {
      setSubmitting(false);
    }
  }

  const inProgress = board?.inProgress ?? [];
  const current = board?.due.filter((d) => !d.overdue) ?? [];
  const overdue = board?.due.filter((d) => d.overdue) ?? [];

  // Tanpa ?tab=: buka "Sedang Dikerjakan" kalau ada pekerjaan yang belum selesai, selain itu "Minggu ini"
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : inProgress.length > 0 ? "progress" : "current";

  const tabs: { value: Tab; label: string; count: number; urgent?: boolean }[] = [
    { value: "progress", label: "Sedang Dikerjakan", count: inProgress.length },
    { value: "current", label: "Minggu ini", count: current.length },
    { value: "overdue", label: "Terlambat", count: overdue.length, urgent: overdue.length > 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">General Checkup</h1>
          {board && <p className="text-sm text-muted-foreground">Minggu berjalan: {formatPeriod(board.period)}</p>}
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        {/* Tab: bisa digeser di HP kalau tidak muat */}
        <div className="flex gap-1 overflow-x-auto border-b px-2">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSearchParams({ tab: t.value }, { replace: true })}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                tab === t.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-2 text-xs tabular-nums",
                  t.urgent ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
                )}
              >
                {board ? t.count : "-"}
              </span>
            </button>
          ))}
        </div>

        {tab === "progress" ? (
          <InProgressTable rows={inProgress} loading={!board} error={error} />
        ) : (
          <DueTable
            rows={tab === "current" ? current : overdue}
            loading={!board}
            error={error}
            emptyText={tab === "current" ? "Tidak ada jadwal checkup minggu ini" : "Tidak ada jadwal yang terlambat"}
            onStart={setStarting}
          />
        )}
      </Card>

      <AlertDialog open={starting !== null} onOpenChange={(open) => !open && !submitting && setStarting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mulai checkup {starting?.asset.kode}?</AlertDialogTitle>
            <AlertDialogDescription>
              Jadwal {starting && formatPeriod(starting)} · checksheet "{starting?.checksheet?.name}" (
              {starting?.checksheet?.itemCount} poin). Waktu mulai dicatat sekarang dan jadwal berubah menjadi In
              progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                if (starting) handleStart(starting);
              }}
            >
              {submitting ? "Memulai..." : "Mulai Checkup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Baris status (memuat / kosong) yang sama untuk kedua tabel
function StatusRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

function InProgressTable({ rows, loading, error }: { rows: CheckupSummary[]; loading: boolean; error: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-4">Kode</TableHead>
          <TableHead className="px-4">Mesin</TableHead>
          <TableHead className="px-4">Dikerjakan oleh</TableHead>
          <TableHead className="px-4">Mulai</TableHead>
          <TableHead className="px-4">Hasil</TableHead>
          <TableHead className="px-4">Status</TableHead>
          <TableHead className="px-4 text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <StatusRow colSpan={7}>{error ? "-" : "Memuat..."}</StatusRow>
        ) : rows.length === 0 ? (
          <StatusRow colSpan={7}>
            <ClipboardCheck className="mx-auto mb-2 size-8 opacity-40" />
            Tidak ada checkup yang sedang dikerjakan
          </StatusRow>
        ) : (
          rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="px-4 font-mono text-sm">{c.kode}</TableCell>
              <TableCell className="px-4">
                <div className="font-medium">{c.asset.kode}</div>
                <div className="text-xs text-muted-foreground">{c.asset.category.name}</div>
              </TableCell>
              <TableCell className="px-4">{c.user.name}</TableCell>
              <TableCell className="px-4">
                <div>{formatDateTime(c.startedAt)}</div>
                <div className="text-xs text-muted-foreground">{formatDuration(c.startedAt)} berjalan</div>
              </TableCell>
              <TableCell className="px-4 text-sm">
                {c.submittedAt ? (
                  <div>
                    <span className="text-emerald-600 dark:text-emerald-400">{c.counts.ok} OK</span>
                    {" · "}
                    <span className="text-destructive">{c.counts.ng} NG</span>
                    <div className="text-xs text-muted-foreground">
                      {c.counts.ngOpen} NG belum ditutup
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    {c.counts.total - c.counts.pending}/{c.counts.total} terisi
                  </span>
                )}
              </TableCell>
              <TableCell className="px-4">
                <CheckupStatusBadge checkup={c} />
              </TableCell>
              <TableCell className="px-4 text-right">
                <Button size="sm" variant={c.submittedAt ? "outline" : "default"} asChild>
                  <Link to={`/transaksi/general-checkup/${c.id}`}>{c.submittedAt ? "Lihat" : "Lanjutkan"}</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function DueTable({
  rows,
  loading,
  error,
  emptyText,
  onStart,
}: {
  rows: DueCheckup[];
  loading: boolean;
  error: string;
  emptyText: string;
  onStart: (item: DueCheckup) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-4">Mesin</TableHead>
          <TableHead className="px-4">Kategori</TableHead>
          <TableHead className="px-4">Jadwal</TableHead>
          <TableHead className="px-4">Checksheet</TableHead>
          <TableHead className="px-4 text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <StatusRow colSpan={5}>{error ? "-" : "Memuat..."}</StatusRow>
        ) : rows.length === 0 ? (
          <StatusRow colSpan={5}>
            <ClipboardCheck className="mx-auto mb-2 size-8 opacity-40" />
            {emptyText}
          </StatusRow>
        ) : (
          rows.map((d) => (
            <TableRow key={d.scheduleId}>
              <TableCell className="px-4">
                <div className="font-medium">{d.asset.kode}</div>
                {d.asset.description && (
                  <div className="max-w-56 truncate text-xs text-muted-foreground">{d.asset.description}</div>
                )}
              </TableCell>
              <TableCell className="px-4">{d.asset.category.name}</TableCell>
              <TableCell className="px-4">
                <div className={cn(d.overdue && "font-medium text-destructive")}>{formatPeriod(d)}</div>
                {d.tipe === "yearly" && (
                  <Badge variant="outline" className="mt-1">
                    Tahunan
                  </Badge>
                )}
              </TableCell>
              <TableCell className="px-4">
                {d.checksheet ? (
                  <>
                    <div>{d.checksheet.name}</div>
                    <div className="text-xs text-muted-foreground">{d.checksheet.itemCount} poin</div>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" /> Belum ada checksheet
                  </span>
                )}
              </TableCell>
              <TableCell className="px-4 text-right">
                <Button
                  size="sm"
                  disabled={!d.checksheet || d.checksheet.itemCount === 0}
                  onClick={() => onStart(d)}
                  title={d.checksheet ? undefined : "Atur checksheet mesin ini di halaman Data Asset"}
                >
                  <Play /> Mulai
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
