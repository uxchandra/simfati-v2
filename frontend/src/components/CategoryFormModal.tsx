import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Category, FieldErrors, KategoriAset } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  title: string; // mis. "Kategori Schedule"
  endpoint: string; // mis. "/schedule-categories"
  category: Category | null; // null = tambah, ada isi = edit
  // true = ada pilihan kategori aset (Kategori Schedule: jembatan ke asset yang dijadwalkan)
  withKategoriAset?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function CategoryFormModal({ title, endpoint, category, withKategoriAset, onClose, onSaved }: Props) {
  const isEdit = category !== null;

  const [name, setName] = useState(category?.name ?? "");
  const [kategoriAsetId, setKategoriAsetId] = useState(category?.kategoriAset ? String(category.kategoriAset.id) : "");
  const [kategoriAsetOptions, setKategoriAsetOptions] = useState<Pick<KategoriAset, "id" | "name">[]>([]);

  useEffect(() => {
    if (!withKategoriAset) return;
    api<Pick<KategoriAset, "id" | "name">[]>("/kategori-aset/all")
      .then(setKategoriAsetOptions)
      .catch(() => setKategoriAsetOptions([]));
  }, [withKategoriAset]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setSubmitting(true);

    try {
      await api(isEdit ? `${endpoint}/${category.id}` : endpoint, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(withKategoriAset ? { name, kategoriAsetId } : { name }),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Tidak bisa terhubung ke server");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${title}` : `Tambah ${title}`}</DialogTitle>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nama</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name[0]}</p>}
          </div>

          {withKategoriAset && (
            <div className="space-y-2">
              <Label>Kategori Aset</Label>
              <Select value={kategoriAsetId} onValueChange={setKategoriAsetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih kategori aset" />
                </SelectTrigger>
                <SelectContent>
                  {kategoriAsetOptions.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Jadwal di kategori ini hanya bisa berisi asset dari kategori aset yang dipilih.
              </p>
              {errors.kategoriAsetId && <p className="text-xs text-destructive">{errors.kategoriAsetId[0]}</p>}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
