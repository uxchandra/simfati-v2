import { STATUS_COLOR, type DisplayStatus } from "../lib/schedule";
import type { PreventiveType } from "../types";
import { cn } from "@/lib/utils";

type Props = {
  tipe: PreventiveType;
  status: DisplayStatus;
  className?: string;
};

// Penanda jadwal seperti di Excel: bulatan = periodik, segitiga = tahunan.
// Terjadwal = garis saja (kosong), status lain = terisi warna.
export default function ScheduleMarker({ tipe, status, className }: Props) {
  const filled = status !== "planned";
  const shapeProps = {
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  };

  return (
    <svg viewBox="0 0 12 12" className={cn("size-3", STATUS_COLOR[status], className)} aria-hidden="true">
      {tipe === "yearly" ? (
        <polygon points="6,1.2 11,10.5 1,10.5" strokeLinejoin="round" {...shapeProps} />
      ) : (
        <circle cx="6" cy="6" r="4.75" {...shapeProps} />
      )}
    </svg>
  );
}
