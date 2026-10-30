import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { apiDownload, apiUpload, ApiError } from "../lib/api";
import ChecksheetItemsTable from "./ChecksheetItemsTable";
import type { ChecksheetImportPreview, ChecksheetImportSheet } from "../types";
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
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function ChecksheetImportModal({ onClose, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ChecksheetImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleFile(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setPreview(null);
    setMessage("");
    setLoading(true);

    try {
      setPreview(await apiUpload<ChecksheetImportPreview>("/checksheets/import/preview", selected));
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
      const res = await apiUpload<{ message: string }>("/checksheets/import", file);
      onSaved(res.message);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      await apiDownload("/checksheets/template", "template-checksheet.xlsx");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Gagal mengunduh template");
    }
  }

  const errorCount = preview?.sheets.filter((s) => s.errors.length > 0).length ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import Checksheet</DialogTitle>
          <DialogDescription>
            Gunakan template standar. Satu sheet = satu checksheet, kategori aset dan nama checksheet diisi di
            dalam file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
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
          {file && <span className="self-center truncate text-sm text-muted-foreground">{file.name}</span>}
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
                  ? `${preview.sheets.length} checksheet siap disimpan. Periksa isinya lalu klik Simpan.`
                  : `${errorCount} dari ${preview.sheets.length} sheet masih error. Perbaiki file lalu pilih ulang.`}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {preview.sheets.map((sheet) => (
                <SheetPreview key={sheet.sheet} sheet={sheet} />
              ))}
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

function SheetPreview({ sheet }: { sheet: ChecksheetImportSheet }) {
  const [open, setOpen] = useState(false);
  const hasError = sheet.errors.length > 0;

  return (
    <div className={`rounded-md border ${hasError ? "border-destructive/50" : ""}`}>
      <button
        type="button"
        className="flex w-full items-start gap-2 p-3 text-left disabled:cursor-default"
        onClick={() => setOpen(!open)}
        disabled={sheet.items.length === 0}
      >
        {sheet.items.length > 0 &&
          (open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />)}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{sheet.name || "(nama checksheet kosong)"}</span>
            {hasError ? (
              <Badge variant="destructive">Error</Badge>
            ) : sheet.existing ? (
              <Badge variant="secondary">Update, mengganti {sheet.existing.itemCount} poin lama</Badge>
            ) : (
              <Badge>Baru</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Sheet "{sheet.sheet}" · Kategori: {sheet.kategori || "-"} · {sheet.items.length} poin pemeriksaan
          </p>
        </div>
      </button>

      {hasError && (
        <ul className="list-disc space-y-0.5 px-3 pb-3 pl-9 text-sm text-destructive">
          {sheet.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {open && (
        <div className="border-t">
          <ChecksheetItemsTable items={sheet.items} />
        </div>
      )}
    </div>
  );
}
