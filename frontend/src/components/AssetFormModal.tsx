import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Asset, AssetStatus, AssetTextField, FieldErrors, KategoriAset } from "../types";
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
  asset: Asset | null; // null = tambah, ada isi = edit / detail
  categoryId: number; // kategori default saat tambah (dari submenu yang dibuka)
  readOnly?: boolean; // true = hanya lihat detail
  onClose: () => void;
  onSaved: () => void;
};

type TextFieldConfig = {
  name: AssetTextField;
  label: string;
  maxLength?: number;
  textarea?: boolean;
};

// Daftar input teks opsional, dikelompokkan supaya form tidak terlalu panjang
const generalFields: TextFieldConfig[] = [
  { name: "model", label: "Model", maxLength: 100 },
  { name: "nomorSeri", label: "Nomor Seri", maxLength: 100 },
  { name: "tahunPembuatan", label: "Tahun Pembuatan", maxLength: 10 },
  { name: "tglInstal", label: "Tanggal Instal", maxLength: 100 },
  { name: "lane", label: "Lane", maxLength: 100 },
  { name: "kapasitas", label: "Kapasitas", maxLength: 100 },
  { name: "power", label: "Power", maxLength: 100 },
  { name: "description", label: "Deskripsi", textarea: true },
  { name: "keterangan", label: "Keterangan", textarea: true },
];

const specFields: TextFieldConfig[] = [
  { name: "capacityKn", label: "Capacity (kN)", maxLength: 100 },
  { name: "slideStroke", label: "Slide Stroke", maxLength: 100 },
  { name: "strokePerMinute", label: "Stroke per Minute", maxLength: 100 },
  { name: "dieHeight", label: "Die Height", maxLength: 100 },
  { name: "slideAdjustment", label: "Slide Adjustment", maxLength: 100 },
  { name: "slideArea", label: "Slide Area", maxLength: 100 },
  { name: "bolsterArea", label: "Bolster Area", maxLength: 100 },
  { name: "mainMotor", label: "Main Motor", maxLength: 100 },
  { name: "reqAirPressure", label: "Req. Air Pressure", maxLength: 100 },
  { name: "maxUpperDieWeight", label: "Max Upper Die Weight", maxLength: 100 },
  { name: "powerSource", label: "Power Source", maxLength: 100 },
  { name: "brakingTime", label: "Braking Time", maxLength: 100 },
];

const allTextFields = [...generalFields, ...specFields].map((f) => f.name);

const NO_CHECKSHEET = "none";

// Style textarea disamakan dengan Input (belum ada komponen Textarea shadcn)
const textareaClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

// Pesan error validasi di bawah input
function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export default function AssetFormModal({ asset, categoryId, readOnly, onClose, onSaved }: Props) {
  const isEdit = asset !== null;

  const [form, setForm] = useState({
    categoryId: String(asset?.categoryId ?? categoryId),
    status: (asset?.status ?? "active") as AssetStatus,
    kode: asset?.kode ?? "",
    // "none" = belum pilih checksheet (Select tidak bisa memakai value kosong)
    checksheetId: asset?.checksheetId ? String(asset.checksheetId) : NO_CHECKSHEET,
    // Semua kolom teks opsional: null dari API -> "" untuk input
    ...(Object.fromEntries(allTextFields.map((name) => [name, asset?.[name] ?? ""])) as Record<
      AssetTextField,
      string
    >),
  });
  const [categories, setCategories] = useState<Pick<KategoriAset, "id" | "name">[]>([]);
  const [checksheets, setChecksheets] = useState<{ id: number; name: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pilihan kategori (asset bisa dipindah ke kategori lain)
  useEffect(() => {
    api<Pick<KategoriAset, "id" | "name">[]>("/kategori-aset/all")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Pilihan checksheet mengikuti kategori yang dipilih
  useEffect(() => {
    api<{ id: number; name: string }[]>(`/checksheets/options?categoryId=${form.categoryId}`)
      .then(setChecksheets)
      .catch(() => setChecksheets([]));
  }, [form.categoryId]);

  function updateField(field: keyof typeof form, value: string) {
    // Ganti kategori = checksheet lama tidak berlaku lagi
    if (field === "categoryId" && value !== form.categoryId) {
      setForm({ ...form, categoryId: value, checksheetId: NO_CHECKSHEET });
      return;
    }
    setForm({ ...form, [field]: value });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setSubmitting(true);

    try {
      await api(isEdit ? `/assets/${asset.id}` : "/assets", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          checksheetId: form.checksheetId === NO_CHECKSHEET ? null : Number(form.checksheetId),
        }),
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

  function renderTextField({ name, label, maxLength, textarea }: TextFieldConfig) {
    return (
      <div key={name} className={textarea ? "space-y-2 sm:col-span-2" : "space-y-2"}>
        <Label htmlFor={name}>{label}</Label>
        {textarea ? (
          <textarea
            id={name}
            rows={3}
            value={form[name]}
            onChange={(e) => updateField(name, e.target.value)}
            className={textareaClass}
          />
        ) : (
          <Input
            id={name}
            value={form[name]}
            onChange={(e) => updateField(name, e.target.value)}
            maxLength={maxLength}
          />
        )}
        <FieldError messages={errors[name]} />
      </div>
    );
  }

  const title = readOnly ? "Detail Asset" : isEdit ? "Edit Asset" : "Tambah Asset";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          {/* disabled di fieldset = semua input ikut terkunci saat mode detail */}
          <fieldset disabled={readOnly} className="space-y-6">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Informasi Umum</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kode">Kode</Label>
                  <Input
                    id="kode"
                    value={form.kode}
                    onChange={(e) => updateField("kode", e.target.value)}
                    maxLength={50}
                    autoFocus={!readOnly}
                  />
                  <FieldError messages={errors.kode} />
                </div>

                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(value) => updateField("categoryId", value)}
                    disabled={readOnly}
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
                  <FieldError messages={errors.categoryId} />
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) => updateField("status", value)}
                    disabled={readOnly}
                  >
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

                <div className="space-y-2">
                  <Label>Checksheet Preventive</Label>
                  <Select
                    value={form.checksheetId}
                    onValueChange={(value) => updateField("checksheetId", value)}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CHECKSHEET}>Belum dipilih</SelectItem>
                      {checksheets.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError messages={errors.checksheetId} />
                </div>

                {generalFields.map(renderTextField)}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Spesifikasi Teknis</h3>
              <div className="grid gap-4 sm:grid-cols-2">{specFields.map(renderTextField)}</div>
            </section>
          </fieldset>

          <DialogFooter className="pt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {readOnly ? "Tutup" : "Batal"}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={submitting}>
                {submitting ? "Menyimpan..." : "Simpan"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
