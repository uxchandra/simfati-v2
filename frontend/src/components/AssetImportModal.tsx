import { useRef, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { apiDownload, apiUpload, ApiError } from "../lib/api";
import type { AssetImportPreview } from "../types";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  categoryId: number; // semua baris masuk ke kategori submenu yang sedang dibuka
  categoryName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const dash = (value: string | null) => value || "-";

export default function AssetImportModal({ categoryId, categoryName, onClose, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AssetImportPreview | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const query = `?categoryId=${categoryId}`;

  async function handleFile(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setMessage("");
    setLoading(true);

    try {
      const result = await apiUpload<AssetImportPreview>(`/assets/import/preview${query}`, selected);
      setPreview(result);
      setOnlyErrors(!result.valid);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setLoading(false);
      // Supaya file yang sama bisa dipilih ulang setelah diperbaiki
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!file) return;
    setMessage("");
    setSaving(true);

    try {
      const res = await apiUpload<{ message: string }>(`/assets/import${query}`, file);
      onSaved(res.message);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadTemplate() {
    const slug = categoryName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    try {
      await apiDownload(`/assets/template${query}`, `template-asset-${slug}.xlsx`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Gagal mengunduh template");
    }
  }

  const rows = preview ? (onlyErrors ? preview.rows.filter((r) => r.errors.length > 0) : preview.rows) : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import Asset — {categoryName}</DialogTitle>
          <DialogDescription>
            Semua baris akan masuk ke kategori "{categoryName}". Kolom KODE wajib ada; kode yang sudah terdaftar di
            kategori ini akan diperbarui, yang belum ada akan ditambahkan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
            <Download /> Download Template
          </Button>
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={loading || saving}>
            <FileSpreadsheet /> {file ? "Ganti File" : "Pilih File Excel"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {file && <span className="min-w-0 self-center truncate text-sm text-muted-foreground">{file.name}</span>}
        </div>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Membaca file...</p>}

        {preview && (
          <>
            <Alert variant={preview.valid ? "default" : "destructive"}>
              <AlertDescription>
                {preview.valid
                  ? `${preview.summary.total} baris siap disimpan: ${preview.summary.baru} baru, ${preview.summary.update} diperbarui.`
                  : `${preview.summary.invalid} dari ${preview.summary.total} baris masih error. Perbaiki file lalu pilih ulang.`}
              </AlertDescription>
            </Alert>

            {!preview.valid && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyErrors}
                  onChange={(e) => setOnlyErrors(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Tampilkan baris error saja
              </label>
            )}

            <div className="max-h-[45vh] min-w-0 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="px-3">Baris</TableHead>
                    <TableHead className="px-3">Import</TableHead>
                    <TableHead className="px-3">Kode</TableHead>
                    <TableHead className="px-3">Status</TableHead>
                    <TableHead className="px-3">Model</TableHead>
                    <TableHead className="px-3">Nomor Seri</TableHead>
                    <TableHead className="px-3">Lane</TableHead>
                    <TableHead className="px-3">Kapasitas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.baris} className={r.errors.length ? "bg-destructive/5" : ""}>
                      <TableCell className="px-3 align-top text-muted-foreground">{r.baris}</TableCell>
                      <TableCell className="px-3 align-top">
                        {r.errors.length ? (
                          <div className="space-y-1">
                            <Badge variant="destructive">Error</Badge>
                            <ul className="max-w-56 list-disc pl-4 text-xs whitespace-normal text-destructive">
                              {r.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        ) : r.existingId ? (
                          <Badge variant="secondary">Update</Badge>
                        ) : (
                          <Badge>Baru</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-3 align-top font-medium">{dash(r.kode)}</TableCell>
                      <TableCell className="px-3 align-top">
                        {r.status === "active" ? "Active" : "Inactive"}
                      </TableCell>
                      <TableCell className="px-3 align-top">{dash(r.model)}</TableCell>
                      <TableCell className="px-3 align-top text-muted-foreground">{dash(r.nomorSeri)}</TableCell>
                      <TableCell className="px-3 align-top">{dash(r.lane)}</TableCell>
                      <TableCell className="px-3 align-top">{dash(r.kapasitas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
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
