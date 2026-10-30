import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { FieldErrors, Sparepart } from "../types";
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
  sparepart: Sparepart | null; // null = tambah, ada isi = edit
  onClose: () => void;
  onSaved: () => void;
};

// Pesan error validasi di bawah input
function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

function Optional() {
  return <span className="text-muted-foreground">(opsional)</span>;
}

const toText = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));

export default function SparepartFormModal({ sparepart, onClose, onSaved }: Props) {
  const isEdit = sparepart !== null;

  const [form, setForm] = useState({
    kodeBarang: toText(sparepart?.kodeBarang),
    namaBarang: toText(sparepart?.namaBarang),
    spec: toText(sparepart?.spec),
    stok: toText(sparepart?.stok),
    minimalStok: toText(sparepart?.minimalStok),
    maksimalStok: toText(sparepart?.maksimalStok),
    uom: toText(sparepart?.uom),
    keterangan: toText(sparepart?.keterangan),
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
      await api(isEdit ? `/spareparts/${sparepart.id}` : "/spareparts", {
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

  const numberField = (field: "stok" | "minimalStok" | "maksimalStok", label: string) => (
    <div className="space-y-2">
      <Label htmlFor={field}>{label}</Label>
      <Input
        id={field}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={form[field]}
        onChange={(e) => updateField(field, e.target.value)}
      />
      <FieldError messages={errors[field]} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Sparepart" : "Tambah Sparepart"}</DialogTitle>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kodeBarang">Kode Barang</Label>
              <Input
                id="kodeBarang"
                value={form.kodeBarang}
                onChange={(e) => updateField("kodeBarang", e.target.value)}
                autoFocus
              />
              <FieldError messages={errors.kodeBarang} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="uom">
                UOM <Optional />
              </Label>
              <Input
                id="uom"
                value={form.uom}
                onChange={(e) => updateField("uom", e.target.value)}
                placeholder="PCS, SET, M..."
              />
              <FieldError messages={errors.uom} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="namaBarang">
              Nama Sparepart <Optional />
            </Label>
            <Input
              id="namaBarang"
              value={form.namaBarang}
              onChange={(e) => updateField("namaBarang", e.target.value)}
            />
            <FieldError messages={errors.namaBarang} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec">
              Spec <Optional />
            </Label>
            <Input id="spec" value={form.spec} onChange={(e) => updateField("spec", e.target.value)} />
            <FieldError messages={errors.spec} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {numberField("stok", "Stok")}
            {numberField("minimalStok", "Min. Stok")}
            {numberField("maksimalStok", "Maks. Stok")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="keterangan">
              Keterangan <Optional />
            </Label>
            {/* Belum ada komponen Textarea shadcn, jadi pakai style yang sama dengan Input */}
            <textarea
              id="keterangan"
              rows={3}
              value={form.keterangan}
              onChange={(e) => updateField("keterangan", e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <FieldError messages={errors.keterangan} />
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
