import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Search, Trash2, Upload } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { displayStatus, STATUS_LABEL, type DisplayStatus } from "../lib/schedule";
import ScheduleGrid from "../components/ScheduleGrid";
import ScheduleMarker from "../components/ScheduleMarker";
import ScheduleImportModal from "../components/ScheduleImportModal";
import ScheduleDetailModal from "../components/ScheduleDetailModal";
import type { KategoriAset, PreventivePlan, PreventiveSchedule, PreventiveScheduleTable } from "../types";
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

export default function PreventiveSchedulePage() {
  const { user } = useAuth();
  // Import, ubah status & hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";

  // Kategori & tahun disimpan di URL supaya bisa di-refresh / dibagikan
  const [params, setParams] = useSearchParams();
  const categoryId = params.get("kategori") ?? "";
  const tahun = Number(params.get("tahun")) || new Date().getFullYear();

  const [categories, setCategories] = useState<Pick<KategoriAset, "id" | "name">[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [table, setTable] = useState<PreventiveScheduleTable | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<{ plan: PreventivePlan; schedule: PreventiveSchedule } | null>(null);

  function setFilter(next: { kategori?: string; tahun?: number }) {
    setParams(
      { kategori: next.kategori ?? categoryId, tahun: String(next.tahun ?? tahun) },
      { replace: true },
    );
  }

  // Kategori aset; default pilih yang pertama
  useEffect(() => {
    api<Pick<KategoriAset, "id" | "name">[]>("/kategori-aset/all")
      .then((data) => {
        setCategories(data);
        if (!categoryId && data[0]) setFilter({ kategori: String(data[0].id) });
      })
      .catch(() => setCategories([]));
  }, []);

  async function loadData() {
    if (!categoryId) return;
    setLoading(true);
    setError("");
    try {
      const [data, yearList] = await Promise.all([
        api<PreventiveScheduleTable>(`/preventive-schedules?categoryId=${categoryId}&tahun=${tahun}`),
        api<number[]>(`/preventive-schedules/years?categoryId=${categoryId}`),
      ]);
      setTable(data);
      setYears(yearList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat jadwal");
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang saat kategori/tahun berubah (lewat timer, sama seperti halaman lain)
  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, [categoryId, tahun]);

  // Pilihan tahun: tahun yang sudah ada jadwalnya + tahun ini + tahun yang sedang dipilih
  const yearOptions = useMemo(
    () => [...new Set([...years, new Date().getFullYear(), tahun])].sort((a, b) => b - a),
    [years, tahun],
  );

  const plans = useMemo(() => table?.plans ?? [], [table]);

  // Ringkasan per status (termasuk "terlambat" yang dihitung dari tanggal hari ini)
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

  function handleImported(message: string, importedCategoryId: string, importedYear: number) {
    setImporting(false);
    setSuccess(message);
    if (importedCategoryId === categoryId && importedYear === tahun) loadData();
    else setFilter({ kategori: importedCategoryId, tahun: importedYear });
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

  async function handleDelete() {
    setError("");
    setSuccess("");
    try {
      const res = await api<{ message: string }>(`/preventive-schedules?categoryId=${categoryId}&tahun=${tahun}`, {
        method: "DELETE",
      });
      setSuccess(res.message);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus jadwal");
    }
  }

  const categoryName = categories.find((c) => String(c.id) === categoryId)?.name ?? "";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Jadwal Preventive</h1>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {plans.length > 0 && (
              <Button variant="outline" onClick={() => setDeleting(true)} className="text-destructive hover:text-destructive">
                <Trash2 /> Hapus Jadwal {tahun}
              </Button>
            )}
            <Button onClick={() => setImporting(true)} disabled={categories.length === 0}>
              <Upload /> Import Excel
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
          <Select value={categoryId} onValueChange={(value) => setFilter({ kategori: value })}>
            <SelectTrigger className="w-full lg:w-52">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(tahun)} onValueChange={(value) => setFilter({ tahun: Number(value) })}>
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
            {isAdmin && " Klik Import Excel untuk memasukkan jadwal dari file Excel."}
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
            }))}
            onMarkerClick={(row, schedule) =>
              setSelected({ plan: row.data, schedule: schedule as PreventiveSchedule })
            }
          />
        )}
      </Card>

      {importing && (
        <ScheduleImportModal
          categories={categories}
          defaultCategoryId={categoryId}
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

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus jadwal {categoryName} {tahun}?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua {plans.length} baris dan {total} jadwal (termasuk status in progress/selesai) akan dihapus
              permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
