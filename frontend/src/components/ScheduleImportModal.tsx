import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { apiUpload, ApiError } from "../lib/api";
import ScheduleGrid from "./ScheduleGrid";
import type { ScheduleImportPreview } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  // Kategori schedule (halaman) tempat jadwal hasil import disimpan
  scheduleCategoryId: string;
  scheduleCategoryName: string;
  // Kategori aset yang terhubung ke kategori schedule: nama mesin di Excel dicocokkan ke asset kategori ini
  categoryName: string;
  onClose: () => void;
  onSaved: (message: string, tahun: number) => void;
};

export default function ScheduleImportModal({
  scheduleCategoryId,
  scheduleCategoryName,
  categoryName: assetCategoryName,
  onClose,
  onSaved,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ScheduleImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Baca file tanpa menyimpan (nama mesin dicocokkan ke asset kategori aset milik kategori schedule ini)
  async function runPreview(nextFile: File) {
    setPreview(null);
    setMessage("");
    setLoading(true);
    try {
      setPreview(
        await apiUpload<ScheduleImportPreview>(
          `/preventive-schedules/import/preview?scheduleCategoryId=${scheduleCategoryId}`,
          nextFile,
        ),
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!file || !preview?.tahun) return;
    setMessage("");
    setSaving(true);
    try {
      const res = await apiUpload<{ message: string }>(
        `/preventive-schedules/import?scheduleCategoryId=${scheduleCategoryId}`,
        file,
      );
      onSaved(res.message, preview.tahun);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  const categoryName = `${scheduleCategoryName} (${assetCategoryName})`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(1500px,96vw)]">
        <DialogHeader>
          <DialogTitle>Import Jadwal {scheduleCategoryName}</DialogTitle>
          <DialogDescription>
            Upload file Excel jadwal yang biasa dipakai. Bulatan/segitiga di tabel W1–W4 dibaca otomatis sebagai
            jadwal.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Nama mesin di file dicocokkan dengan asset kategori{" "}
          <span className="font-medium text-foreground">{assetCategoryName}</span>.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>
            <FileSpreadsheet /> {file ? "Ganti File" : "Pilih File Excel"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) {
                setFile(selected);
                runPreview(selected);
              }
              e.target.value = "";
            }}
          />
          {file && <span className="truncate text-sm text-muted-foreground sm:self-center">{file.name}</span>}
        </div>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Membaca file...</p>}

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Sheet: {preview.sheet}</Badge>
              <Badge variant="secondary">Tahun: {preview.tahun ?? "-"}</Badge>
              <Badge variant="secondary">{preview.summary.rows} mesin/aktivitas</Badge>
              <Badge variant="secondary">{preview.summary.schedules} jadwal</Badge>
              <Badge variant="secondary">{preview.summary.matched} terhubung ke asset</Badge>
              {preview.summary.unmatched > 0 && (
                <Badge variant="outline">{preview.summary.unmatched} belum terhubung ke asset</Badge>
              )}
            </div>

            {preview.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {preview.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {preview.valid && (
              <Alert>
                <AlertDescription>
                  {preview.existing.plans > 0
                    ? `Jadwal ${categoryName} ${preview.tahun} yang sudah ada (${preview.existing.plans} baris, ${preview.existing.schedules} jadwal) akan DIGANTI dengan isi file ini.`
                    : `Jadwal ${categoryName} ${preview.tahun} akan dibuat. Periksa tabel di bawah, lalu klik Simpan.`}
                </AlertDescription>
              </Alert>
            )}

            {preview.warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <ul className="list-disc space-y-0.5 pl-4">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.summary.unmatched > 0 && (
              <p className="text-xs text-muted-foreground">
                Baris yang belum terhubung tetap disimpan. Daftarkan asset dengan kode yang sama (mis. "PT.61" untuk
                "PT.61(PT.57)") lalu import ulang supaya jadwal terhubung ke mesin dan checksheet-nya.
              </p>
            )}

            {preview.tahun && (
              <div className="rounded-md border">
                <ScheduleGrid
                  preview
                  className="max-h-[60vh]"
                  tahun={preview.tahun}
                  rows={preview.rows.map((row) => ({
                    key: row.baris,
                    no: row.no,
                    grup: row.grup,
                    nama: row.nama,
                    deskripsi: row.deskripsi,
                    schedules: row.schedules,
                    data: row,
                    extra: row.asset ? null : (
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        tanpa asset
                      </Badge>
                    ),
                  }))}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="button" onClick={handleSave} disabled={!preview?.valid || saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
