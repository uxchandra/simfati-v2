import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCheck,
  Loader2,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { isAdmin as checkIsAdmin } from "../lib/roles";
import {
  formatDateTime,
  formatDuration,
  formatPeriod,
  SHIFT_LABEL,
} from "../lib/checkup";
import CheckupStatusBadge from "../components/CheckupStatusBadge";
import RepairHandlingPanel from "../components/RepairHandlingPanel";
import PhotoGallery from "../components/PhotoGallery";
import type {
  CheckResult,
  CheckupDetail,
  FieldErrors,
  GeneralCheckup,
} from "../types";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Answer = { result: CheckResult; notes: string };

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";


export default function CheckupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = checkIsAdmin(user);

  const [checkup, setCheckup] = useState<GeneralCheckup | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);


  function applyData(data: GeneralCheckup) {
    setCheckup(data);
    setAnswers(
      Object.fromEntries(
        data.details.map((d) => [
          d.id,
          { result: d.result, notes: d.notes ?? "" },
        ]),
      ),
    );
    setNotes(data.notes ?? "");
    setDirty(false);
  }

  function loadData() {
    return api<GeneralCheckup>(`/general-checkups/${id}`)
      .then(applyData)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : "Gagal memuat checkup",
        ),
      );
  }

  useEffect(() => {
    loadData();
  }, [id]);

  // Peringatan sebelum menutup tab kalau ada isian yang belum disimpan
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const editable = !!checkup && !checkup.submittedAt;
  const photosEditable = !!checkup && checkup.status !== "completed";

  // Poin dikelompokkan per bagian, urutan mengikuti checksheet
  const groups = useMemo(() => {
    const map = new Map<string, CheckupDetail[]>();
    for (const d of checkup?.details ?? []) {
      if (!map.has(d.bagian)) map.set(d.bagian, []);
      map.get(d.bagian)!.push(d);
    }
    return [...map.entries()];
  }, [checkup]);

  const counts = useMemo(() => {
    const values = Object.values(answers);
    return {
      total: values.length,
      ok: values.filter((a) => a.result === "OK").length,
      ng: values.filter((a) => a.result === "NG").length,
      pending: values.filter((a) => a.result === "PENDING").length,
    };
  }, [answers]);

  function setAnswer(detailId: number, patch: Partial<Answer>) {
    setAnswers((prev) => ({
      ...prev,
      [detailId]: { ...prev[detailId], ...patch },
    }));
    setErrors((prev) => ({ ...prev, [`details.${detailId}`]: undefined }));
    setDirty(true);
  }

  // Shortcut: poin yang belum diisi di satu bagian langsung OK
  function markGroupOk(details: CheckupDetail[]) {
    setAnswers((prev) => {
      const next = { ...prev };
      for (const d of details)
        if (next[d.id].result === "PENDING")
          next[d.id] = { ...next[d.id], result: "OK" };
      return next;
    });
    setDirty(true);
  }

  async function save(submit: boolean) {
    if (!checkup) return;
    setSaving(submit ? "submit" : "draft");
    setError("");
    setSuccess("");
    setErrors({});
    try {
      const res = await api<{ message: string }>(
        `/general-checkups/${checkup.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            notes,
            submit,
            details: Object.entries(answers).map(([detailId, a]) => ({
              id: Number(detailId),
              result: a.result,
              notes: a.notes,
            })),
          }),
        },
      );
      setSuccess(res.message);
      await loadData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.errors);
        // Lompat ke poin pertama yang bermasalah
        const firstPending = checkup.details.find(
          (d) => answers[d.id].result === "PENDING",
        );
        const firstError = Object.keys(err.errors)[0]?.replace("details.", "");
        const target =
          firstError ?? (firstPending ? String(firstPending.id) : null);
        if (target)
          document
            .getElementById(`poin-${target}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setError("Tidak bisa terhubung ke server");
      }
    } finally {
      setSaving(null);
      setConfirmSubmit(false);
    }
  }

  function handleNgChanged(message: string) {
    setError("");
    setSuccess(message);
    loadData();
  }

  async function handleDelete() {
    if (!checkup) return;
    try {
      await api(`/general-checkups/${checkup.id}`, { method: "DELETE" });
      navigate("/transaksi/general-checkup");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal menghapus checkup",
      );
      setConfirmDelete(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/transaksi/general-checkup">
            <ArrowLeft /> Kembali
          </Link>
        </Button>
      </div>
    );
  }

  if (!checkup)
    return (
      <div className="py-12 text-center text-muted-foreground">Memuat...</div>
    );

  const info: [string, string][] = [
    [
      "Mesin",
      `${checkup.asset.kode}${checkup.asset.description ? ` · ${checkup.asset.description}` : ""}`,
    ],
    ["Kategori", checkup.asset.category.name],
    ["Checksheet", checkup.checksheetName],
    [
      "Jadwal",
      checkup.schedule
        ? formatPeriod(checkup.schedule)
        : "Jadwal sudah dihapus",
    ],
    ["Dikerjakan oleh", checkup.user.name],
    ["Shift", SHIFT_LABEL[checkup.shift]],
    ["Mulai", formatDateTime(checkup.startedAt)],
    checkup.completedAt
      ? [
          "Selesai",
          `${formatDateTime(checkup.completedAt)} (${formatDuration(checkup.startedAt, checkup.completedAt)})`,
        ]
      : ["Lama berjalan", formatDuration(checkup.startedAt)],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> Kembali
        </Button>
        <div className="flex-1" />
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> Hapus Checkup
          </Button>
        )}
      </div>

      {/* ===== Info checkup ===== */}
      <Card className="gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold">{checkup.kode}</h1>
          <CheckupStatusBadge checkup={checkup} />
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {info.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Progress pengisian */}
        <div>
          <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {counts.total - counts.pending} dari {counts.total} poin terisi
            </span>
            <span className="font-medium">
              <span className="text-emerald-600 dark:text-emerald-400">
                {counts.ok} OK
              </span>
              {" · "}
              <span className="text-destructive">{counts.ng} NG</span>
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="bg-emerald-500 transition-all"
              style={{
                width: `${(counts.ok / Math.max(1, counts.total)) * 100}%`,
              }}
            />
            <div
              className="bg-destructive transition-all"
              style={{
                width: `${(counts.ng / Math.max(1, counts.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      </Card>

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
      {checkup.status === "on_progress" && checkup.submittedAt && (
        <Alert className="border-amber-500/40 text-amber-700 dark:text-amber-300">
          <AlertDescription>
            Masih ada <strong>{checkup.counts.ngOpen}</strong> dari{" "}
            {checkup.counts.ng} poin NG yang belum ditutup. Pilih tindakan untuk
            setiap NG (ganti part, inhouse, atau outhouse repair), lalu tutup NG
            setelah selesai. Checkup otomatis selesai saat semua NG sudah
            ditutup.
          </AlertDescription>
        </Alert>
      )}

      {/* ===== Poin pemeriksaan per bagian ===== */}
      {groups.map(([bagian, details]) => {
        const pendingInGroup = details.filter(
          (d) => answers[d.id]?.result === "PENDING",
        ).length;
        return (
          <Card key={bagian} className="gap-0 py-0">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
              <h2 className="font-semibold">{bagian}</h2>
              {editable && pendingInGroup > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markGroupOk(details)}
                >
                  <CheckCheck /> Sisa OK ({pendingInGroup})
                </Button>
              )}
            </div>
            <div className="divide-y">
              {details.map((d) => {
                const answer = answers[d.id];
                const fieldError = errors[`details.${d.id}`];
                const needsAttention =
                  !!fieldError ||
                  (!!error && editable && answer.result === "PENDING");
                return (
                  <div
                    key={d.id}
                    id={`poin-${d.id}`}
                    className={cn(
                      "px-4 py-3",
                      answer.result === "NG" &&
                        !d.ngClosedAt &&
                        "bg-destructive/5",
                      needsAttention && "ring-2 ring-inset ring-destructive/50",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <span className="mt-0.5 w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                          {d.urutan}.
                        </span>
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium whitespace-pre-line">
                            {d.poin}
                          </p>
                          {(d.metode || d.standar) && (
                            <div className="grid gap-x-4 text-xs text-muted-foreground sm:grid-cols-2">
                              {d.metode && (
                                <p className="whitespace-pre-line">
                                  <span className="font-medium">Metode:</span>{" "}
                                  {d.metode}
                                </p>
                              )}
                              {d.standar && (
                                <p className="whitespace-pre-line">
                                  <span className="font-medium">Standar:</span>{" "}
                                  {d.standar}
                                </p>
                              )}
                            </div>
                          )}
                          {!editable && answer.notes && (
                            <p className="text-sm text-destructive">
                              Keterangan: {answer.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 pl-9 sm:w-64 sm:shrink-0 sm:pl-0">
                        {editable ? (
                          <div className="grid grid-cols-2 gap-2">
                            {(["OK", "NG"] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  setAnswer(d.id, {
                                    result:
                                      answer.result === value
                                        ? "PENDING"
                                        : value,
                                  })
                                }
                                className={cn(
                                  "h-10 rounded-lg border-2 text-sm font-bold transition-colors",
                                  answer.result === value
                                    ? value === "OK"
                                      ? "border-emerald-500 bg-emerald-500 text-white"
                                      : "border-destructive bg-destructive text-white"
                                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                                )}
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex h-8 w-16 items-center justify-center rounded-lg text-sm font-bold",
                              answer.result === "OK" &&
                                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                              answer.result === "NG" &&
                                "bg-destructive/15 text-destructive",
                              answer.result === "PENDING" &&
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {answer.result === "PENDING" ? "-" : answer.result}
                          </span>
                        )}
                        {editable && answer.result === "NG" && (
                          <textarea
                            rows={2}
                            value={answer.notes}
                            onChange={(e) =>
                              setAnswer(d.id, { notes: e.target.value })
                            }
                            placeholder="Keterangan NG (wajib), mis. oli bocor di seal"
                            aria-invalid={!!fieldError}
                            className={textareaClass}
                          />
                        )}
                        {fieldError && (
                          <p className="text-xs text-destructive">
                            {fieldError[0]}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Penanganan NG setelah hasil disubmit */}
                    {checkup.submittedAt && d.result === "NG" && (
                      <RepairHandlingPanel
                        basePath={`/general-checkups/${checkup.id}/details/${d.id}`}
                        data={d}
                        closedAt={d.ngClosedAt}
                        canHandle={checkup.status === "on_progress"}
                        className="mt-3 sm:ml-9"
                        description={
                          <>
                            {d.urutan}. {d.poin}
                            {d.notes && <span className="block text-destructive">NG: {d.notes}</span>}
                          </>
                        }
                        defaultProblem={d.notes ?? ""}
                        onChanged={handleNgChanged}
                        onError={(message) => {
                          setSuccess("");
                          setError(message);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* ===== Catatan & foto ===== */}
      <Card className="gap-4 p-4 sm:p-6">
        <div className="space-y-2">
          <h2 className="font-semibold">Catatan</h2>
          {editable ? (
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="Catatan umum checkup (opsional)"
              className={textareaClass}
            />
          ) : (
            <p className="text-sm whitespace-pre-line text-muted-foreground">
              {checkup.notes || "-"}
            </p>
          )}
        </div>

        <PhotoGallery
          title="Foto Dokumentasi"
          photos={checkup.photos}
          endpoint={`/general-checkups/${checkup.id}/photos`}
          editable={photosEditable}
          onChange={(photos) => setCheckup((prev) => (prev ? { ...prev, photos } : prev))}
          onError={setError}
        />
      </Card>

      {/* ===== Tombol simpan (menempel di bawah layar) ===== */}
      {editable && (
        <div className="sticky bottom-2 z-20 rounded-xl border bg-background/95 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 p-3">
            <span className="hidden flex-1 text-sm text-muted-foreground sm:block">
              {dirty
                ? "Ada perubahan yang belum disimpan"
                : "Semua perubahan tersimpan"}
            </span>
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={saving !== null || !dirty}
              onClick={() => save(false)}
            >
              {saving === "draft" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}{" "}
              Simpan Draft
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={saving !== null}
              onClick={() => setConfirmSubmit(true)}
            >
              <Send /> Selesai & Submit
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={confirmSubmit}
        onOpenChange={(open) =>
          !open && saving === null && setConfirmSubmit(false)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit hasil checkup?</AlertDialogTitle>
            <AlertDialogDescription>
              {counts.pending > 0
                ? `Masih ada ${counts.pending} poin yang belum diisi. Semua poin harus diisi OK / NG sebelum submit.`
                : counts.ng > 0
                  ? `Hasil: ${counts.ok} OK, ${counts.ng} NG. Checkup tetap berstatus on progress sampai NG ditangani. Hasil OK/NG tidak bisa diubah setelah submit.`
                  : `Semua ${counts.ok} poin OK. Checkup akan langsung selesai dan jadwal preventive ditandai Selesai.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving !== null}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving !== null}
              onClick={(e) => {
                e.preventDefault();
                save(true);
              }}
            >
              {saving === "submit" ? "Menyimpan..." : "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus checkup {checkup.kode}?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua hasil pemeriksaan dan foto akan dihapus permanen. Jadwal
              preventive-nya kembali ke status Terjadwal sehingga bisa
              dikerjakan ulang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
