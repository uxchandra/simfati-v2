import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { ROLES } from "../lib/roles";
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

type Options = {
  roles: Pick<Role, "id" | "code" | "name">[];
  subconts: { id: number; nama: string }[];
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
    roleId: user ? String(user.role.id) : "",
    subcontId: user?.subcont ? String(user.subcont.id) : "",
  });
  const [options, setOptions] = useState<Options | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<Options>("/users/options")
      .then(setOptions)
      .catch(() => setMessage("Gagal memuat pilihan role"));
  }, []);

  const selectedRole = options?.roles.find((r) => String(r.id) === form.roleId);
  const isSubcont = selectedRole?.code === ROLES.SUBCONT;

  // Subcont yang sedang terhubung tetap tampil walau statusnya sudah tidak aktif
  const subconts =
    user?.subcont && options && !options.subconts.some((s) => s.id === user.subcont!.id)
      ? [...options.subconts, user.subcont]
      : (options?.subconts ?? []);

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
        // subcontId hanya dikirim untuk role subcont
        body: JSON.stringify({ ...form, subcontId: isSubcont ? form.subcontId : "" }),
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
            <Select
              value={form.roleId}
              onValueChange={(value) => updateField("roleId", value)}
              disabled={!options}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={options ? "Pilih role" : "Memuat..."} />
              </SelectTrigger>
              <SelectContent>
                {options?.roles.map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError messages={errors.roleId} />
          </div>

          {isSubcont && (
            <div className="space-y-2">
              <Label>Perusahaan Subcont</Label>
              <Select value={form.subcontId} onValueChange={(value) => updateField("subcontId", value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih subcont" />
                </SelectTrigger>
                <SelectContent>
                  {subconts.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nama}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subconts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada subcont aktif. Tambahkan dulu di menu Data Master → Subcont.
                </p>
              )}
              <FieldError messages={errors.subcontId} />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting || !options}>
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
