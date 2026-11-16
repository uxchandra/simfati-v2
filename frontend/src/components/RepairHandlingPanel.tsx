import { useState, type ReactNode } from "react";
import { Building2, CheckCircle2, PackageCheck, Pencil, Plus, Repeat, Wrench, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { ACTION_LABEL, formatDateTime, OUTHOUSE_CLASS, OUTHOUSE_LABEL } from "../lib/checkup";
import RepairActionModal from "./RepairActionModal";
import type { PartRequest, RepairAction, RepairData } from "../types";
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
import { cn } from "@/lib/utils";

type Props = {
  // Dasar endpoint: "/general-checkups/1/details/5" (poin NG) atau "/repair-requests/3"
  basePath: string;
  data: RepairData;
  // Kapan sudah ditutup (null = masih terbuka)
  closedAt: string | null;
  // false = hanya lihat (mis. sudah selesai / bukan mekanik)
  canHandle: boolean;
  // Untuk modal pilih tindakan
  description: ReactNode;
  defaultProblem: string;
  labels?: { close?: string; closed?: string; confirmClose?: string };
  className?: string;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
};

type Confirm =
  | { type: "close" }
  | { type: "install"; part: PartRequest }
  | { type: "cancel-part"; part: PartRequest };

const ACTION_ICON = { ganti_part: PackageCheck, inhouse: Wrench, outhouse: Building2 } as const;

// Penanganan kerusakan: pilih tindakan, pantau progres, lalu tutup
export default function RepairHandlingPanel({
  basePath,
  data,
  closedAt,
  canHandle,
  description,
  defaultProblem,
  labels,
  className,
  onChanged,
  onError,
}: Props) {
  const [modal, setModal] = useState<RepairAction | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const open = canHandle && !closedAt;
  const parts = data.partRequests;
  const outhouse = data.outhouseRepair;
  const closeText = labels?.close ?? "Tutup NG";

  // Syarat tutup (backend juga mengecek)
  const closeBlocker =
    data.repairAction === "ganti_part"
      ? parts.some((p) => !p.installedAt)
        ? "Tandai semua part terpasang dulu"
        : null
      : data.repairAction === "outhouse"
        ? outhouse?.status === "waiting_confirmation"
          ? null
          : "Menunggu subcont menyelesaikan perbaikan"
        : null;

  // Tindakan bisa diganti selama belum ada progres
  const canSwitch =
    (data.repairAction !== "ganti_part" || !parts.some((p) => p.installedAt)) &&
    (data.repairAction !== "outhouse" || outhouse?.status === "pending");

  async function run() {
    if (!confirm) return;
    setBusy(true);
    try {
      const res =
        confirm.type === "close"
          ? await api<{ message: string }>(`${basePath}/close`, { method: "POST" })
          : confirm.type === "install"
            ? await api<{ message: string }>(`${basePath}/parts/${confirm.part.id}/install`, { method: "POST" })
            : await api<{ message: string }>(`${basePath}/parts/${confirm.part.id}`, { method: "DELETE" });
      onChanged(res.message);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const Icon = data.repairAction ? ACTION_ICON[data.repairAction] : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        closedAt ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-background",
        className,
      )}
    >
      {/* Judul: tindakan + status */}
      <div className="flex flex-wrap items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <span className="font-medium">{data.repairAction ? ACTION_LABEL[data.repairAction] : "Belum ada tindakan"}</span>
        {data.repairAction === "outhouse" && outhouse && (
          <Badge className={cn("border-transparent", OUTHOUSE_CLASS[outhouse.status])}>{OUTHOUSE_LABEL[outhouse.status]}</Badge>
        )}
        {closedAt && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" /> {labels?.closed ?? "NG ditutup"} {formatDateTime(closedAt)}
          </span>
        )}
      </div>

      {/* Belum ada tindakan: pilih salah satu */}
      {!data.repairAction && open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(ACTION_LABEL) as RepairAction[]).map((action) => {
            const ActionIcon = ACTION_ICON[action];
            return (
              <Button key={action} variant="outline" size="sm" onClick={() => setModal(action)}>
                <ActionIcon /> {ACTION_LABEL[action]}
              </Button>
            );
          })}
        </div>
      )}
      {!data.repairAction && !open && !closedAt && (
        <p className="mt-1 text-muted-foreground">Menunggu mekanik memilih tindakan perbaikan</p>
      )}

      {/* Inhouse / outhouse: problem & perbaikan */}
      {(data.inhouseRepair || outhouse) && (
        <dl className="mt-2 grid gap-1 text-muted-foreground">
          {outhouse && (
            <div>
              <dt className="inline font-medium text-foreground">Subcont: </dt>
              <dd className="inline">{outhouse.subcont.nama}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium text-foreground">Problem: </dt>
            <dd className="inline whitespace-pre-line">{data.inhouseRepair?.problem ?? outhouse?.problem}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">{outhouse ? "Perbaikan diminta: " : "Perbaikan: "}</dt>
            <dd className="inline whitespace-pre-line">{data.inhouseRepair?.perbaikan ?? outhouse?.perbaikan}</dd>
          </div>
          {outhouse?.hasil && (
            <div>
              <dt className="inline font-medium text-foreground">Laporan subcont: </dt>
              <dd className="inline whitespace-pre-line">{outhouse.hasil}</dd>
            </div>
          )}
          {outhouse?.startedAt && (
            <div className="text-xs">
              Mulai {formatDateTime(outhouse.startedAt)}
              {outhouse.finishedAt && ` · selesai ${formatDateTime(outhouse.finishedAt)}`}
            </div>
          )}
        </dl>
      )}

      {/* Ganti part: daftar part */}
      {data.repairAction === "ganti_part" && (
        <ul className="mt-2 divide-y rounded-md border">
          {parts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {p.sparepart.kodeBarang}{" "}
                  <span className="font-normal text-muted-foreground">
                    × {p.quantity} {p.sparepart.uom}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[p.sparepart.namaBarang, p.keterangan].filter(Boolean).join(" · ") || "-"}
                </div>
              </div>
              {p.installedAt ? (
                <span className="text-xs text-emerald-700 dark:text-emerald-300">Terpasang {formatDateTime(p.installedAt)}</span>
              ) : (
                <>
                  <span className={cn("text-xs", (p.sparepart.stok ?? 0) < p.quantity ? "text-destructive" : "text-muted-foreground")}>
                    Stok {p.sparepart.stok ?? 0}
                  </span>
                  {open && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ type: "install", part: p })}>
                        Tandai Terpasang
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        title="Batalkan permintaan"
                        onClick={() => setConfirm({ type: "cancel-part", part: p })}
                      >
                        <X />
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Aksi */}
      {open && data.repairAction && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.repairAction === "ganti_part" && (
            <Button size="sm" variant="outline" onClick={() => setModal("ganti_part")}>
              <Plus /> Tambah Part
            </Button>
          )}
          {data.repairAction !== "ganti_part" && canSwitch && (
            <Button size="sm" variant="outline" onClick={() => setModal(data.repairAction)}>
              <Pencil /> Edit
            </Button>
          )}
          {canSwitch && (
            <Button size="sm" variant="ghost" onClick={() => setModal(data.repairAction === "inhouse" ? "outhouse" : "inhouse")}>
              <Repeat /> Ganti Tindakan
            </Button>
          )}
          <div className="flex-1" />
          {closeBlocker && <span className="text-xs text-muted-foreground">{closeBlocker}</span>}
          <Button size="sm" disabled={!!closeBlocker} onClick={() => setConfirm({ type: "close" })}>
            <CheckCircle2 /> {data.repairAction === "outhouse" ? "Konfirmasi Selesai" : closeText}
          </Button>
        </div>
      )}

      {modal && (
        <RepairActionModal
          endpoint={`${basePath}/action`}
          data={data}
          description={description}
          defaultProblem={defaultProblem}
          action={modal}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            onChanged(message);
          }}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(value) => !value && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === "close"
                ? data.repairAction === "outhouse"
                  ? "Konfirmasi perbaikan subcont selesai?"
                  : `${closeText}?`
                : confirm?.type === "install"
                  ? "Tandai part terpasang?"
                  : "Batalkan permintaan part?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === "close"
                ? (labels?.confirmClose ??
                  "Pastikan mesin sudah diperiksa ulang dan kondisinya normal. Setelah ditutup tidak bisa dibuka lagi.")
                : confirm?.type === "install"
                  ? `Stok ${confirm.part.sparepart.kodeBarang} akan berkurang ${confirm.part.quantity} ${confirm.part.sparepart.uom ?? ""}.`
                  : confirm?.type === "cancel-part"
                    ? `Permintaan ${confirm.part.sparepart.kodeBarang} × ${confirm.part.quantity} akan dihapus.`
                    : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {busy ? "Memproses..." : "Ya, lanjutkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
