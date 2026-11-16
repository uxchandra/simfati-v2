import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { CheckCircle2, ClipboardCheck, Play } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { formatDateTime, OUTHOUSE_CLASS, OUTHOUSE_LABEL, textareaClass } from "../lib/checkup";
import type { SubcontRepair, SubcontRepairList } from "../types";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type View = "active" | "history";

// Halaman akun subcont: daftar outhouse repair perusahaannya (sama seperti menu Repair Request & History subcont di v1)
export default function SubcontRepairPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get("view") === "history" ? "history" : "active";

  const [result, setResult] = useState<SubcontRepairList | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [starting, setStarting] = useState<SubcontRepair | null>(null);
  const [finishing, setFinishing] = useState<SubcontRepair | null>(null);
  const [busy, setBusy] = useState(false);

  function loadData() {
    return api<SubcontRepairList>(`/subcont-repairs?view=${view}&page=${page}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data perbaikan"));
  }

  useEffect(() => {
    loadData();
  }, [view, page]);

  async function handleStart() {
    if (!starting) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/subcont-repairs/${starting.id}/start`, { method: "POST" });
      setSuccess(res.message);
      setError("");
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulai perbaikan");
    } finally {
      setBusy(false);
      setStarting(null);
    }
  }

  const activeCount =
    (result?.counts.pending ?? 0) + (result?.counts.on_progress ?? 0) + (result?.counts.waiting_confirmation ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Repair Request</h1>
        <p className="text-sm text-muted-foreground">Permintaan perbaikan dari tim maintenance untuk perusahaan Anda</p>
      </div>

      {success && (
        <Alert className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-1 overflow-x-auto border-b">
        {(
          [
            ["active", "Perlu Dikerjakan", activeCount],
            ["history", "Riwayat Selesai", result?.counts.completed ?? 0],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSearchParams({ view: value }, { replace: true });
              setPage(1);
            }}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap",
              view === value ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums">{result ? count : "-"}</span>
          </button>
        ))}
      </div>

      {!result ? (
        <p className="py-10 text-center text-muted-foreground">{error ? "-" : "Memuat..."}</p>
      ) : result.data.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-2 size-8 opacity-40" />
          {view === "active" ? "Tidak ada perbaikan yang perlu dikerjakan" : "Belum ada riwayat perbaikan"}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {result.data.map((r) => {
            const asset = r.source.asset;
            return (
              <Card key={r.id} className="gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {asset.kode}
                      {asset.description && <span className="font-normal text-muted-foreground"> · {asset.description}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {asset.category.name}
                      {asset.lane && ` · Lane ${asset.lane}`} ·{" "}
                      {r.source.type === "checkup" ? "General Checkup" : "Repair Request"} {r.source.kode}
                    </div>
                  </div>
                  <Badge className={cn("border-transparent", OUTHOUSE_CLASS[r.status])}>{OUTHOUSE_LABEL[r.status]}</Badge>
                </div>

                <dl className="grid gap-1.5 text-sm">
                  {r.source.poin && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Bagian / poin</dt>
                      <dd>
                        {r.source.bagian} — {r.source.poin}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-muted-foreground">Problem</dt>
                    <dd className="whitespace-pre-line">{r.problem}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Perbaikan yang diminta</dt>
                    <dd className="font-medium whitespace-pre-line">{r.perbaikan}</dd>
                  </div>
                  {r.hasil && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Laporan hasil</dt>
                      <dd className="whitespace-pre-line">{r.hasil}</dd>
                    </div>
                  )}
                </dl>

                <div className="text-xs text-muted-foreground">
                  Diminta {r.createdAt ? formatDateTime(r.createdAt) : "-"}
                  {r.user && ` oleh ${r.user.name}`}
                  {r.startedAt && ` · mulai ${formatDateTime(r.startedAt)}`}
                  {r.finishedAt && ` · selesai ${formatDateTime(r.finishedAt)}`}
                  {r.confirmedAt && ` · dikonfirmasi ${formatDateTime(r.confirmedAt)}`}
                </div>

                {r.status === "pending" && (
                  <Button onClick={() => setStarting(r)}>
                    <Play /> Mulai Perbaikan
                  </Button>
                )}
                {r.status === "on_progress" && (
                  <Button onClick={() => setFinishing(r)}>
                    <CheckCircle2 /> Selesai
                  </Button>
                )}
                {r.status === "waiting_confirmation" && (
                  <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                    Menunggu konfirmasi dari mekanik
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {result && result.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Sebelumnya
          </Button>
          <span>
            {result.page} / {result.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= result.totalPages} onClick={() => setPage(page + 1)}>
            Berikutnya
          </Button>
        </div>
      )}

      <AlertDialog open={starting !== null} onOpenChange={(open) => !open && !busy && setStarting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mulai perbaikan {starting?.source.asset.kode}?</AlertDialogTitle>
            <AlertDialogDescription>Waktu mulai dicatat sekarang dan tim maintenance bisa melihat progresnya.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                handleStart();
              }}
            >
              {busy ? "Memproses..." : "Mulai"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {finishing && (
        <FinishModal
          repair={finishing}
          onClose={() => setFinishing(null)}
          onSaved={(message) => {
            setFinishing(null);
            setSuccess(message);
            setError("");
            loadData();
          }}
        />
      )}
    </div>
  );
}

function FinishModal({
  repair,
  onClose,
  onSaved,
}: {
  repair: SubcontRepair;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [hasil, setHasil] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const res = await api<{ message: string }>(`/subcont-repairs/${repair.id}/finish`, {
        method: "POST",
        body: JSON.stringify({ hasil }),
      });
      onSaved(res.message);
    } catch (err) {
      setMessage(err instanceof ApiError ? (err.errors.hasil?.[0] ?? err.message) : "Tidak bisa terhubung ke server");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Selesaikan perbaikan</DialogTitle>
          <DialogDescription>
            {repair.source.asset.kode} · {repair.perbaikan}
          </DialogDescription>
        </DialogHeader>
        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hasil">Laporan hasil perbaikan</Label>
            <textarea
              id="hasil"
              rows={4}
              value={hasil}
              onChange={(e) => setHasil(e.target.value)}
              placeholder="Apa yang sudah dikerjakan dan kondisi akhirnya"
              className={textareaClass}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Menyimpan..." : "Kirim Laporan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
