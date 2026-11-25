import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { isAdmin as checkIsAdmin } from "../lib/roles";
import { displayStatus, STATUS_LABEL, type DisplayStatus } from "../lib/schedule";
import ScheduleGrid from "../components/ScheduleGrid";
import ScheduleMarker from "../components/ScheduleMarker";
import ScheduleImportModal from "../components/ScheduleImportModal";
import ScheduleDetailModal from "../components/ScheduleDetailModal";
import PlanFormModal from "../components/PlanFormModal";
import type { Category, PreventivePlan, PreventiveSchedule, PreventiveScheduleTable } from "../types";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_ORDER: DisplayStatus[] = ["planned", "overdue", "in_progress", "done"];

// Halaman jadwal per kategori schedule (/schedule/kategori/:scheduleCategoryId).
// `key` membuat halaman di-reset penuh saat pindah submenu kategori schedule.
export default function PreventiveSchedulePageRoute() {
  const { scheduleCategoryId = "" } = useParams();
  return <PreventiveSchedulePage key={scheduleCategoryId} scheduleCategoryId={scheduleCategoryId} />;
}

function PreventiveSchedulePage({ scheduleCategoryId }: { scheduleCategoryId: string }) {
  const { user } = useAuth();
  // Import, ubah status & hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = checkIsAdmin(user);

  // Tahun disimpan di URL supaya bisa di-refresh / dibagikan
  const [params, setParams] = useSearchParams();
  const tahun = Number(params.get("tahun")) || new Date().getFullYear();

  // Kategori schedule halaman ini + kategori aset yang terhubung (diatur di menu Kategori Schedule)
  const [scheduleCategory, setScheduleCategory] = useState<Category | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [years, setYears] = useState<number[]>([]);
  const [table, setTable] = useState<PreventiveScheduleTable | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [importing, setImporting] = useState(false);
  // Form baris jadwal: null = tertutup, "new" = tambah, plan = edit
  const [editing, setEditing] = useState<PreventivePlan | "new" | null>(null);
  const [deleting, setDeleting] = useState<PreventivePlan | null>(null);
  const [selected, setSelected] = useState<{ plan: PreventivePlan; schedule: PreventiveSchedule } | null>(null);

  function setTahun(value: number) {
    setParams({ tahun: String(value) }, { replace: true });
  }

  useEffect(() => {
    api<Category>(`/schedule-categories/${scheduleCategoryId}`)
      .then(setScheduleCategory)
      .catch(() => setNotFound(true));
  }, []);

  const scheduleCategoryName = scheduleCategory?.name ?? "";
  const categoryId = scheduleCategory?.kategoriAset ? String(scheduleCategory.kategoriAset.id) : "";
  const categoryName = scheduleCategory?.kategoriAset?.name ?? "";
  const scopeQuery = `scheduleCategoryId=${scheduleCategoryId}`;

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [data, yearList] = await Promise.all([
        api<PreventiveScheduleTable>(`/preventive-schedules?${scopeQuery}&tahun=${tahun}`),
        api<number[]>(`/preventive-schedules/years?${scopeQuery}`),
      ]);
      setTable(data);
      setYears(yearList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat jadwal");
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang saat tahun berubah (lewat timer, sama seperti halaman lain)
  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, [tahun]);

  // Pilihan tahun: tahun yang sudah ada jadwalnya + tahun ini + tahun yang sedang dipilih
  // (+ tahun depan supaya jadwal tahun depan bisa langsung dibuka / diisi)
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    return [...new Set([...years, thisYear, thisYear + 1, tahun])].sort((a, b) => b - a);
  }, [years, tahun]);

  const plans = useMemo(() => table?.plans ?? [], [table]);

  // Ringkasan per status (termasuk "delay" yang dihitung dari tanggal hari ini)
  const summary = useMemo(() => {
    const count: Record<DisplayStatus, number> = { planned: 0, overdue: 0, in_progress: 0, done: 0 };
    for (const plan of plans) for (const s of plan.schedules) count[displayStatus(s, tahun)]++;
    return count;
  }, [plans, tahun]);
  const total = STATUS_ORDER.reduce((n, s) => n + summary[s], 0);

  const keyword = search.trim().toLowerCase();
  const visiblePlans = keyword
    ? plans.filter((p) =>
        [p.nama, p.deskripsi, p.grup, p.asset?.kode].some((v) => v?.toLowerCase().includes(keyword)),
      )
    : plans;

  function handleImported(message: string, importedYear: number) {
    setImporting(false);
    setSuccess(message);
    if (importedYear === tahun) loadData();
    else setTahun(importedYear);
  }

  // Update satu jadwal di tabel tanpa memuat ulang semuanya
  function handleScheduleUpdated(updated: PreventiveSchedule) {
    setTable((prev) =>
      prev && {
        ...prev,
        plans: prev.plans.map((p) => ({
          ...p,
          schedules: p.schedules.map((s) => (s.id === updated.id ? updated : s)),
        })),
      },
    );
    setSelected((prev) => prev && { ...prev, schedule: updated });
  }

  // Setelah tambah/edit baris: muat ulang supaya urutan & grup ikut ter-update
  // Kalau baris ditambahkan ke tahun lain, pindah ke tahun tsb supaya hasilnya langsung terlihat
  function handlePlanSaved(_plan: PreventivePlan, message: string, savedTahun: number) {
    setEditing(null);
    setError("");
    setSuccess(message);
    if (savedTahun !== tahun) setTahun(savedTahun);
    else loadData();
  }

  // Hapus satu baris (ditolak backend kalau ada jadwal yang sudah berjalan)
  async function handleDeletePlan(plan: PreventivePlan) {
    setError("");
    setSuccess("");
    try {
      const res = await api<{ message: string }>(`/preventive-schedules/plans/${plan.id}`, { method: "DELETE" });
      setSuccess(res.message);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus baris jadwal");
    }
  }

  if (notFound) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Kategori schedule tidak ditemukan.</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{scheduleCategoryName || "Jadwal"}</h1>
          {categoryName && <p className="text-sm text-muted-foreground">Asset kategori {categoryName}</p>}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImporting(true)} disabled={!categoryId}>
              <Upload /> Import Excel
            </Button>
            <Button onClick={() => setEditing("new")} disabled={!categoryId}>
              <Plus /> Tambah Baris
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="mb-4">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="gap-1 px-4 py-3">
          <span className="text-xs text-muted-foreground">Total jadwal</span>
          <span className="text-2xl font-semibold">{total}</span>
        </Card>
        {STATUS_ORDER.map((status) => (
          <Card key={status} className="gap-1 px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ScheduleMarker tipe="periodic" status={status} />
              {STATUS_LABEL[status]}
            </span>
            <span className="text-2xl font-semibold">{summary[status]}</span>
          </Card>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-2 border-b p-4 lg:flex-row lg:items-center">
          <Select value={String(tahun)} onValueChange={(value) => setTahun(Number(value))}>
            <SelectTrigger className="w-full lg:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari mesin / aktivitas..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:ml-auto">
            {STATUS_ORDER.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <ScheduleMarker tipe="periodic" status={status} />
                {STATUS_LABEL[status]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <ScheduleMarker tipe="yearly" status="planned" />
              Tahunan
            </span>
          </div>
        </div>

        {loading && !table ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Memuat...</p>
        ) : plans.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Belum ada jadwal {categoryName} tahun {tahun}.
            {isAdmin && " Klik Tambah Baris untuk mengisi manual, atau Import Excel dari file jadwal."}
          </div>
        ) : visiblePlans.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada yang cocok dengan "{search}"</p>
        ) : (
          <ScheduleGrid
            // Tinggi menyesuaikan layar: tabel scroll di dalam kartu, scrollbar samping selalu terlihat
            className="max-h-[calc(100svh-21.5rem)] min-h-96"
            tahun={tahun}
            rows={visiblePlans.map((plan, i) => ({
              key: plan.id,
              no: String(i + 1),
              grup: plan.grup,
              nama: plan.nama,
              deskripsi: plan.deskripsi,
              schedules: plan.schedules,
              data: plan,
              extra: plan.asset ? null : (
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                  tanpa asset
                </Badge>
              ),
              actions: isAdmin ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="Edit baris"
                    onClick={() => setEditing(plan)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    title="Hapus baris"
                    onClick={() => setDeleting(plan)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : null,
            }))}
            onMarkerClick={(row, schedule) =>
              setSelected({ plan: row.data, schedule: schedule as PreventiveSchedule })
            }
          />
        )}
      </Card>

      {importing && (
        <ScheduleImportModal
          scheduleCategoryId={scheduleCategoryId}
          scheduleCategoryName={scheduleCategoryName}
          categoryName={categoryName}
          onClose={() => setImporting(false)}
          onSaved={handleImported}
        />
      )}

      {selected && (
        <ScheduleDetailModal
          plan={selected.plan}
          schedule={selected.schedule}
          tahun={tahun}
          canEdit={isAdmin}
          onClose={() => setSelected(null)}
          onUpdated={handleScheduleUpdated}
        />
      )}

      {editing && (
        <PlanFormModal
          plan={editing === "new" ? null : editing}
          scheduleCategoryId={scheduleCategoryId}
          scheduleCategoryName={scheduleCategoryName}
          categoryName={categoryName}
          tahun={tahun}
          onClose={() => setEditing(null)}
          onSaved={handlePlanSaved}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleting?.nama}?</AlertDialogTitle>
            <AlertDialogDescription>
              Baris ini beserta {deleting?.schedules.length ?? 0} jadwalnya di tahun {tahun} akan dihapus. Baris yang
              punya jadwal in progress / selesai tidak bisa dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && handleDeletePlan(deleting)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
