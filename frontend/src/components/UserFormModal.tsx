import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { FieldErrors, Role, User } from "../types";
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
  user: User | null; // null = tambah, ada isi = edit
  onClose: () => void;
  onSaved: () => void;
};

// Pesan error validasi di bawah input
function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export default function UserFormModal({ user, onClose, onSaved }: Props) {
  const isEdit = user !== null;

  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    password: "",
    role: (user?.role ?? "USER") as Role,
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
      await api(isEdit ? `/users/${user.id}` : "/users", {
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
    // Selalu open: komponen ini hanya di-render saat modal perlu tampil.
    // Klik di luar / tombol X / Esc -> onOpenChange(false) -> tutup.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Tambah User"}</DialogTitle>
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
            />
            <FieldError messages={errors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
            <FieldError messages={errors.email} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Password
              {isEdit && <span className="text-muted-foreground">(kosongkan jika tidak diubah)</span>}
            </Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
            />
            <FieldError messages={errors.password} />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(value) => updateField("role", value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <FieldError messages={errors.role} />
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
