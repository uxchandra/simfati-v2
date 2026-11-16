import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { FieldErrors, Role } from "../types";
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

type Props = {
  role: Role | null; // null = tambah, ada isi = edit
  onClose: () => void;
  onSaved: () => void;
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export default function RoleFormModal({ role, onClose, onSaved }: Props) {
  const isEdit = role !== null;
  // Code role sistem dipakai kode untuk cek hak akses, jadi dikunci
  const codeLocked = role?.isSystem ?? false;

  const [form, setForm] = useState({
    code: role?.code ?? "",
    name: role?.name ?? "",
    description: role?.description ?? "",
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
      await api(isEdit ? `/roles/${role.id}` : "/roles", {
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
          <DialogTitle>{isEdit ? "Edit Role" : "Tambah Role"}</DialogTitle>
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
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="mis. Leader Produksi"
              autoFocus
            />
            <FieldError messages={errors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Kode</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => updateField("code", e.target.value.toLowerCase())}
              placeholder="mis. leader_produksi"
              disabled={codeLocked}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {codeLocked
                ? "Kode role sistem tidak bisa diubah karena dipakai untuk mengatur hak akses."
                : "Huruf kecil, angka, dan garis bawah (_). Dipakai sistem untuk mengatur hak akses."}
            </p>
            <FieldError messages={errors.code} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Input
              id="description"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Opsional"
            />
            <FieldError messages={errors.description} />
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
