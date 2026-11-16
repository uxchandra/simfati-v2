import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ban, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { hasRole, isAdmin as checkIsAdmin, ROLES } from "../lib/roles";
import { formatDateTime, formatDuration, RR_STATUS_CLASS, RR_STATUS_LABEL } from "../lib/checkup";
import PhotoGallery from "../components/PhotoGallery";
import RepairHandlingPanel from "../components/RepairHandlingPanel";
import type { RepairRequest } from "../types";
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
import { cn } from "@/lib/utils";

export default function RepairRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = checkIsAdmin(user);
  const isHandler = hasRole(user, ROLES.SUPERADMIN, ROLES.MEKANIK);

  const [request, setRequest] = useState<RepairRequest | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(
    (location.state as { created?: boolean } | null)?.created ? "Laporan dibuat. Tambahkan foto kerusakan bila ada." : "",
  );
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  function loadData() {
    return api<RepairRequest>(`/repair-requests/${id}`)
      .then(setRequest)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Gagal memuat repair request"));
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function runConfirm() {
    if (!request || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "delete") {
        await api(`/repair-requests/${request.id}`, { method: "DELETE" });
        navigate("/transaksi/repair-request");
        return;
      }
      const res = await api<{ message: string }>(`/repair-requests/${request.id}/cancel`, { method: "POST" });
      setSuccess(res.message);
      setError("");
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/transaksi/repair-request">
            <ArrowLeft /> Kembali
          </Link>
        </Button>
      </div>
    );
  }

  if (!request) return <div className="py-12 text-center text-muted-foreground">Memuat...</div>;

  const isOpen = request.status === "pending" || request.status === "in_progress";
  const hasProgress =
    request.partRequests.some((p) => p.installedAt) ||
    (!!request.outhouseRepair && request.outhouseRepair.status !== "pending");
  // Pelapor bisa batal selama belum ditangani; mekanik / superadmin selama belum ada progres
  const canCancel =
    isOpen && !hasProgress && (isHandler || (request.requestedBy.id === user?.id && request.status === "pending"));

  const info: [string, string][] = [
    ["Mesin", `${request.asset.kode}${request.asset.description ? ` · ${request.asset.description}` : ""}`],
    ["Kategori", request.asset.category.name],
    ["Lane", request.asset.lane ?? "-"],
    ["Pelapor", request.requestedBy.name],
    ["Dilaporkan", formatDateTime(request.requestedAt)],
    request.completedAt
      ? ["Selesai", `${formatDateTime(request.completedAt)} (${formatDuration(request.requestedAt, request.completedAt)})`]
      : request.cancelledAt
        ? ["Dibatalkan", formatDateTime(request.cancelledAt)]
        : ["Lama berjalan", formatDuration(request.requestedAt)],
  ];

  const setErrorOnly = (message: string) => {
    setSuccess("");
    setError(message);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> Kembali
        </Button>
        <div className="flex-1" />
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm("cancel")}>
            <Ban /> Batalkan Laporan
          </Button>
        )}
        {isAdmin && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm("delete")}>
            <Trash2 /> Hapus
          </Button>
        )}
      </div>

      <Card className="gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold">{request.kode}</h1>
          <Badge className={cn("border-transparent", RR_STATUS_CLASS[request.status])}>{RR_STATUS_LABEL[request.status]}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {info.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Deskripsi problem</div>
          <p className="whitespace-pre-line">{request.problem}</p>
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

      {request.status !== "cancelled" && (
        <Card className="gap-3 p-4 sm:p-6">
          <h2 className="font-semibold">Penanganan</h2>
          <RepairHandlingPanel
            basePath={`/repair-requests/${request.id}`}
            data={request}
            closedAt={request.completedAt}
            canHandle={isHandler && isOpen}
            description={
              <>
                {request.asset.kode} · {request.problem}
              </>
            }
            defaultProblem={request.problem}
            labels={{
              close: "Tutup Laporan",
              closed: "Selesai",
              confirmClose: "Pastikan mesin sudah normal kembali. Laporan yang sudah ditutup tidak bisa dibuka lagi.",
            }}
            onChanged={(message) => {
              setError("");
              setSuccess(message);
              loadData();
            }}
            onError={setErrorOnly}
          />
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <PhotoGallery
          title="Foto Kerusakan"
          photos={request.photos}
          endpoint={`/repair-requests/${request.id}/photos`}
          editable={isOpen}
          onChange={(photos) => setRequest((prev) => (prev ? { ...prev, photos } : prev))}
          onError={setErrorOnly}
        />
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(value) => !value && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? `Hapus ${request.kode}?` : `Batalkan ${request.kode}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Laporan beserta foto dan data penanganannya dihapus permanen."
                : "Laporan ditandai dibatalkan dan data tindakan yang belum berjalan dihapus."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                runConfirm();
              }}
              className={confirm === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {busy ? "Memproses..." : confirm === "delete" ? "Hapus" : "Batalkan Laporan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
