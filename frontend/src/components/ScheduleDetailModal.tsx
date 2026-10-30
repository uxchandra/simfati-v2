import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { displayStatus, formatDate, MONTHS, STATUS_LABEL, weekRange } from "../lib/schedule";
import ScheduleMarker from "./ScheduleMarker";
import type { PreventivePlan, PreventiveSchedule, ScheduleStatus } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  plan: PreventivePlan;
  schedule: PreventiveSchedule;
  tahun: number;
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (schedule: PreventiveSchedule) => void;
};

const STATUS_OPTIONS: { value: ScheduleStatus; label: string }[] = [
  { value: "planned", label: "Belum jalan" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Selesai" },
];

export default function ScheduleDetailModal({ plan, schedule, tahun, canEdit, onClose, onUpdated }: Props) {
  const [saving, setSaving] = useState<ScheduleStatus | null>(null);
  const [message, setMessage] = useState("");

  const { start, end } = weekRange(tahun, schedule.bulan, schedule.minggu);
  const status = displayStatus(schedule, tahun);

  async function changeStatus(value: ScheduleStatus) {
    setMessage("");
    setSaving(value);
    try {
      onUpdated(
        await api<PreventiveSchedule>(`/preventive-schedules/schedules/${schedule.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: value }),
        }),
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setSaving(null);
    }
  }

  const rows: [string, string][] = [
    ["Jadwal", `${MONTHS[schedule.bulan - 1]} W${schedule.minggu} (${formatDate(start)} – ${formatDate(end)})`],
    ["Jenis", schedule.tipe === "yearly" ? "Tahunan" : "Periodik"],
    ["Asset", plan.asset?.kode ?? "Belum terhubung ke data asset"],
    ["Checksheet", plan.asset?.checksheet?.name ?? "-"],
    ["Mulai", schedule.startedAt ? formatDate(schedule.startedAt) : "-"],
    ["Selesai", schedule.completedAt ? formatDate(schedule.completedAt) : "-"],
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan.nama}</DialogTitle>
          <DialogDescription>{[plan.grup, plan.deskripsi].filter(Boolean).join(" · ") || "Jadwal preventive"}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm font-medium">
          <ScheduleMarker tipe={schedule.tipe} status={status} className="size-4" />
          {STATUS_LABEL[status]}
        </div>

        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {canEdit && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Ubah status (sementara manual, nantinya otomatis dari pengisian checksheet)
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={schedule.status === option.value ? "default" : "outline"}
                  disabled={saving !== null}
                  onClick={() => changeStatus(option.value)}
                >
                  {saving === option.value ? "Menyimpan..." : option.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
