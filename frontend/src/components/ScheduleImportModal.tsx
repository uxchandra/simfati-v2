import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { apiUpload, ApiError } from "../lib/api";
import ScheduleGrid from "./ScheduleGrid";
import type { KategoriAset, ScheduleImportPreview } from "../types";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  categories: Pick<KategoriAset, "id" | "name">[];
  defaultCategoryId: string;
  onClose: () => void;
  onSaved: (message: string, categoryId: string, tahun: number) => void;
};

export default function ScheduleImportModal({ categories, defaultCategoryId, onClose, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ScheduleImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Baca file; diulang setiap kali file atau kategori berganti (pencocokan asset tergantung kategori)
  async function runPreview(nextFile: File | null, nextCategoryId: string) {
    if (!nextFile || !nextCategoryId) return;
    setPreview(null);
    setMessage("");
    setLoading(true);
    try {
      setPreview(
        await apiUpload<ScheduleImportPreview>(
          `/preventive-schedules/import/preview?categoryId=${nextCategoryId}`,
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
      const res = await apiUpload<{ message: string }>(`/preventive-schedules/import?categoryId=${categoryId}`, file);
      onSaved(res.message, categoryId, preview.tahun);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  const categoryName = categories.find((c) => String(c.id) === categoryId)?.name ?? "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(1500px,96vw)]">
        <DialogHeader>
          <DialogTitle>Import Jadwal Preventive</DialogTitle>
          <DialogDescription>
            Upload file Excel jadwal yang biasa dipakai. Bulatan/segitiga di tabel W1–W4 dibaca otomatis sebagai
            jadwal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:w-64">
            <Label>Kategori Aset</Label>
            <Select
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value);
                runPreview(file, value);
              }}
            >
              <SelectTrigger className="w-full">
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
          </div>
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={loading || saving || !categoryId}>
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
                runPreview(selected, categoryId);
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
