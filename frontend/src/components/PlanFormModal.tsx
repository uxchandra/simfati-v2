import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { displayStatus, MONTHS, STATUS_COLOR, STATUS_LABEL } from "../lib/schedule";
import ScheduleMarker from "./ScheduleMarker";
import type {
  FieldErrors,
  PreventivePlan,
  PreventiveSchedule,
  PreventiveScheduleTable,
  PreventiveType,
} from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  plan: PreventivePlan | null; // null = tambah, ada isi = edit
  scheduleCategoryId: string;
  scheduleCategoryName: string;
  categoryName: string; // kategori aset milik kategori schedule (hanya asset kategori ini yang bisa dipilih)
  // Tahun yang sedang dibuka di halaman. Tambah: tahun awal (bisa diganti); edit: tahun baris tsb (tetap)
  tahun: number;
  onClose: () => void;
  onSaved: (plan: PreventivePlan, message: string, tahun: number) => void;
};

// Pilihan tahun saat tambah: tahun lalu s/d 3 tahun ke depan (+ tahun yang sedang dibuka)
function yearChoices(current: number) {
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2, thisYear + 3, current];
  return [...new Set(years)].sort((a, b) => a - b);
}

type AssetOption = { id: number; kode: string; description: string | null };

// Jadwal di form: yang sudah tersimpan membawa status (untuk mengunci yang sudah berjalan)
type FormSchedule = Pick<PreventiveSchedule, "bulan" | "minggu" | "tipe"> & Partial<Pick<PreventiveSchedule, "status">>;

const WEEKS = [1, 2, 3, 4];
// Baris hasil import tanpa asset (aktivitas) tetap boleh tanpa asset saat diedit
const NO_ASSET = "none";

// Jenis jadwal mengikuti penanda di Excel jadwal preventive
const TIPE_INFO: Record<PreventiveType, { label: string; hint: string }> = {
  periodic: {
    label: "Periodik",
    hint: "bulatan ○ di Excel, preventive rutin (mis. tiap bulan)",
  },
  yearly: {
    label: "Tahunan",
    hint: "segitiga △ di Excel, preventive besar setahun sekali (overhaul)",
  },
};

const keyOf = (s: Pick<FormSchedule, "bulan" | "minggu" | "tipe">) => `${s.bulan}-${s.minggu}-${s.tipe}`;
// Jadwal yang sudah in progress / selesai tidak bisa dihapus dari form
const isLocked = (s: FormSchedule) => !!s.status && s.status !== "planned";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export default function PlanFormModal({
  plan,
  scheduleCategoryId,
  scheduleCategoryName,
  categoryName,
  tahun: pageTahun,
  onClose,
  onSaved,
}: Props) {
  const isEdit = plan !== null;
  const isActivity = isEdit && !plan.asset;

  const [tahun, setTahun] = useState(pageTahun);
  // Asset yang sudah punya baris di jadwal tahun terpilih (tidak bisa ditambahkan dua kali)
  const [usedAssetIds, setUsedAssetIds] = useState<number[]>([]);

  const [assetId, setAssetId] = useState(plan?.asset ? String(plan.asset.id) : isActivity ? NO_ASSET : "");
  const [schedules, setSchedules] = useState<FormSchedule[]>(plan?.schedules ?? []);
  const [tipe, setTipe] = useState<PreventiveType>("periodic");
  const [assets, setAssets] = useState<AssetOption[] | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Hanya asset dari kategori aset yang terhubung ke kategori schedule ini
    api<AssetOption[]>(`/preventive-schedules/options/assets?scheduleCategoryId=${scheduleCategoryId}`)
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [scheduleCategoryId]);

  useEffect(() => {
    api<PreventiveScheduleTable>(`/preventive-schedules?scheduleCategoryId=${scheduleCategoryId}&tahun=${tahun}`)
      .then((data) => setUsedAssetIds(data.plans.flatMap((p) => (p.asset ? [p.asset.id] : []))))
      .catch(() => setUsedAssetIds([]));
  }, [scheduleCategoryId, tahun]);

  // Asset yang sudah ada di jadwal tidak bisa dipilih lagi (kecuali asset baris yang sedang diedit)
  const isUsed = (id: number) => usedAssetIds.includes(id) && id !== plan?.asset?.id;
  const available = assets?.filter((a) => !isUsed(a.id)) ?? [];

  // Klik satu minggu: tambah/hapus jadwal dengan jenis yang sedang dipilih
  function toggleWeek(bulan: number, minggu: number) {
    const key = keyOf({ bulan, minggu, tipe });
    const existing = schedules.find((s) => keyOf(s) === key);
    if (existing && isLocked(existing)) return;
    setSchedules(existing ? schedules.filter((s) => s !== existing) : [...schedules, { bulan, minggu, tipe }]);
  }

  // Isi cepat: jadwal di minggu yang sama setiap bulan
  function fillEveryMonth(minggu: number) {
    const keys = new Set(schedules.map(keyOf));
    const added = MONTHS.map((_, m) => ({ bulan: m + 1, minggu, tipe })).filter((s) => !keys.has(keyOf(s)));
    setSchedules([...schedules, ...added]);
  }

  // Kosongkan semua jadwal kecuali yang sudah berjalan
  function clearSchedules() {
    setSchedules(schedules.filter(isLocked));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");

    if (!assetId) {
      setErrors({ assetId: ["Asset wajib dipilih"] });
      return;
    }

    setSubmitting(true);
    const body = {
      assetId: assetId === NO_ASSET ? null : Number(assetId),
      schedules: schedules.map(({ bulan, minggu, tipe }) => ({
        bulan,
        minggu,
        tipe,
      })),
      ...(isEdit ? {} : { scheduleCategoryId: Number(scheduleCategoryId), tahun }),
    };

    try {
      const saved = await api<PreventivePlan>(
        isEdit ? `/preventive-schedules/plans/${plan.id}` : "/preventive-schedules/plans",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      onSaved(
        saved,
        isEdit ? `${saved.nama} berhasil diubah` : `${saved.nama} berhasil ditambahkan ke jadwal ${tahun}`,
        tahun,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Tidak bisa terhubung ke server");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Jadwal yang begitu disimpan langsung berstatus delay (masih terjadwal tapi minggunya sudah lewat)
  const delayCount = schedules.filter((s) => displayStatus({ ...s, status: s.status ?? "planned" }, tahun) === "overdue").length;

  const byWeek = new Map<string, FormSchedule[]>();
  for (const s of schedules) {
    const key = `${s.bulan}-${s.minggu}`;
    byWeek.set(key, [...(byWeek.get(key) ?? []), s]);
  }

  const noAssets = assets !== null && available.length === 0 && !isEdit;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${plan.nama}` : "Tambah Baris Jadwal"}</DialogTitle>
          <DialogDescription>
            {scheduleCategoryName} · Asset {categoryName}
            {isEdit && ` · Tahun ${tahun}`}
          </DialogDescription>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tahun & asset satu baris (tahun hanya saat tambah); di layar kecil turun bertumpuk */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {!isEdit && (
              <div className="space-y-2 sm:w-32 sm:shrink-0">
                <Label>Tahun</Label>
                <Select value={String(tahun)} onValueChange={(value) => setTahun(Number(value))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearChoices(pageTahun).map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <Label>Asset {categoryName}</Label>
              {noAssets ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  {assets?.length === 0
                    ? `Belum ada asset di kategori ${categoryName}. Tambahkan dulu lewat menu Data Asset → ${categoryName}.`
                    : `Semua asset ${categoryName} sudah ada di jadwal tahun ${tahun}.`}
                </p>
              ) : (
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={assets === null ? "Memuat asset..." : "Pilih asset"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isActivity && <SelectItem value={NO_ASSET}>Tanpa asset ({plan.nama})</SelectItem>}
                    {(assets ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)} disabled={isUsed(a.id)}>
                        {a.kode}
                        {a.description && <span className="text-muted-foreground"> · {a.description}</span>}
                        {isUsed(a.id) && <span className="text-muted-foreground"> (sudah ada)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError messages={errors.assetId} />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Label>Jadwal {tahun}</Label>
                <p className="text-xs text-muted-foreground">
                  Pilih jenis jadwal, lalu klik minggu untuk menambah / menghapus.
                </p>
              </div>
              {/* Jenis jadwal yang ditambahkan saat minggu diklik */}
              <div className="inline-flex shrink-0 rounded-md border p-0.5">
                {(Object.keys(TIPE_INFO) as PreventiveType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipe(t)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-3 py-1 text-xs",
                      tipe === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <ScheduleMarker tipe={t} status="planned" className={cn(tipe === t && "text-primary-foreground")} />
                    {TIPE_INFO[t].label}
                  </button>
                ))}
              </div>
            </div>

            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{TIPE_INFO[tipe].label}</span>: {TIPE_INFO[tipe].hint}. Satu
              minggu boleh berisi keduanya.
            </p>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Isi tiap bulan ({TIPE_INFO[tipe].label.toLowerCase()}):</span>
              {WEEKS.map((w) => (
                <Button
                  key={w}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => fillEveryMonth(w)}
                >
                  W{w}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearSchedules}>
                Kosongkan
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {MONTHS.map((month, m) => (
                <div key={month} className="rounded-md border p-2">
                  <div className="mb-1.5 text-xs font-medium">{month}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {WEEKS.map((w) => {
                      const markers = byWeek.get(`${m + 1}-${w}`) ?? [];
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => toggleWeek(m + 1, w)}
                          title={
                            markers
                              .map(
                                (s) =>
                                  `${TIPE_INFO[s.tipe].label} · ${STATUS_LABEL[displayStatus({ ...s, status: s.status ?? "planned" }, tahun)]}`,
                              )
                              .join("\n") || `${month} W${w}`
                          }
                          className={cn(
                            "flex h-9 flex-col items-center justify-center gap-0.5 rounded border text-[10px] text-muted-foreground transition-colors hover:border-ring",
                            markers.length > 0 && "border-primary/40 bg-primary/5",
                          )}
                        >
                          <span>W{w}</span>
                          <span className="flex h-3 items-center gap-0.5">
                            {markers.map((s) => (
                              <ScheduleMarker
                                key={s.tipe}
                                tipe={s.tipe}
                                // Jadwal baru dihitung sama seperti di grid: minggu yang sudah lewat = delay
                                status={displayStatus({ ...s, status: s.status ?? "planned" }, tahun)}
                              />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {schedules.length} jadwal dipilih
                {delayCount > 0 && (
                  <span className={STATUS_COLOR.overdue}>
                    {" "}
                    · {delayCount} {STATUS_LABEL.overdue.toLowerCase()} (minggunya sudah lewat)
                  </span>
                )}
              </span>
              {schedules.some(isLocked) && <span>Jadwal yang sudah in progress / selesai tidak bisa dihapus.</span>}
            </div>
            <FieldError messages={errors.schedules} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting || noAssets}>
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
