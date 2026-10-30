import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { FieldErrors, Subcont, SubcontStatus } from "../types";
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
  subcont: Subcont | null; // null = tambah, ada isi = edit
  onClose: () => void;
  onSaved: () => void;
};

// Pesan error validasi di bawah input
function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export default function SubcontFormModal({ subcont, onClose, onSaved }: Props) {
  const isEdit = subcont !== null;

  const [form, setForm] = useState({
    nama: subcont?.nama ?? "",
    alamat: subcont?.alamat ?? "",
    noTelp: subcont?.noTelp ?? "",
    pic: subcont?.pic ?? "",
    status: (subcont?.status ?? "active") as SubcontStatus,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setSubmitting(true);

    try {
      await api(isEdit ? `/subcont/${subcont.id}` : "/subcont", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(form),
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
          <DialogTitle>{isEdit ? "Edit Subcont" : "Tambah Subcont"}</DialogTitle>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nama">Nama</Label>
            <Input
              id="nama"
              value={form.nama}
              onChange={(e) => updateField("nama", e.target.value)}
              autoFocus
            />
            <FieldError messages={errors.nama} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alamat">
              Alamat <span className="text-muted-foreground">(opsional)</span>
            </Label>
            {/* Belum ada komponen Textarea shadcn, jadi pakai style yang sama dengan Input */}
            <textarea
              id="alamat"
              rows={3}
              value={form.alamat}
              onChange={(e) => updateField("alamat", e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <FieldError messages={errors.alamat} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="noTelp">
                No. Telp <span className="text-muted-foreground">(opsional)</span>
              </Label>
              <Input
                id="noTelp"
                type="tel"
                value={form.noTelp}
                onChange={(e) => updateField("noTelp", e.target.value)}
              />
              <FieldError messages={errors.noTelp} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pic">
                PIC <span className="text-muted-foreground">(opsional)</span>
              </Label>
              <Input
                id="pic"
                value={form.pic}
                onChange={(e) => updateField("pic", e.target.value)}
              />
              <FieldError messages={errors.pic} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value) => updateField("status", value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <FieldError messages={errors.status} />
          </div>

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
