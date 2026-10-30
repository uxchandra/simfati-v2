import { useEffect, useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { FieldErrors, KategoriAset, PicAsset, PicMesin, User } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  pic: PicMesin | null; // null = tambah, ada isi = edit
  onClose: () => void;
  onSaved: () => void;
};

// Pesan error validasi di bawah input
function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

export default function PicMesinFormModal({ pic, onClose, onSaved }: Props) {
  const isEdit = pic !== null;

  const [userId, setUserId] = useState(pic ? String(pic.user.id) : "");
  const [categoryId, setCategoryId] = useState("");
  // Mesin terpilih disimpan lengkap supaya tetap tampil walau kategori diganti
  const [selected, setSelected] = useState<PicAsset[]>(pic?.assets ?? []);
  const [assetSearch, setAssetSearch] = useState("");

  const [users, setUsers] = useState<Pick<User, "id" | "name" | "email">[]>([]);
  const [categories, setCategories] = useState<Pick<KategoriAset, "id" | "name">[]>([]);
  const [assets, setAssets] = useState<PicAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pilihan user & kategori
  useEffect(() => {
    if (!isEdit) {
      api<Pick<User, "id" | "name" | "email">[]>("/pic-mesin/options/users")
        .then(setUsers)
        .catch(() => setMessage("Gagal memuat daftar user"));
    }
    api<Pick<KategoriAset, "id" | "name">[]>("/kategori-aset/all")
      .then(setCategories)
      .catch(() => setMessage("Gagal memuat daftar kategori"));
  }, [isEdit]);

  // Pilihan mesin mengikuti kategori yang dipilih
  useEffect(() => {
    if (!categoryId) return;
    setLoadingAssets(true);
    setAssetSearch("");
    api<PicAsset[]>(`/pic-mesin/options/assets?categoryId=${categoryId}`)
      .then(setAssets)
      .catch(() => setMessage("Gagal memuat daftar mesin"))
      .finally(() => setLoadingAssets(false));
  }, [categoryId]);

  const selectedIds = new Set(selected.map((a) => a.id));
  const keyword = assetSearch.trim().toLowerCase();
  const visibleAssets = keyword
    ? assets.filter(
        (a) => a.kode.toLowerCase().includes(keyword) || a.model?.toLowerCase().includes(keyword)
      )
    : assets;
  const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every((a) => selectedIds.has(a.id));

  function toggleAsset(asset: PicAsset) {
    setSelected(
      selectedIds.has(asset.id) ? selected.filter((a) => a.id !== asset.id) : [...selected, asset]
    );
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const visibleIds = new Set(visibleAssets.map((a) => a.id));
      setSelected(selected.filter((a) => !visibleIds.has(a.id)));
    } else {
      setSelected([...selected, ...visibleAssets.filter((a) => !selectedIds.has(a.id))]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setSubmitting(true);

    const assetIds = selected.map((a) => a.id);

    try {
      await api(isEdit ? `/pic-mesin/${pic.user.id}` : "/pic-mesin", {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(isEdit ? { assetIds } : { userId, assetIds }),
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
          <DialogTitle>{isEdit ? "Edit PIC Mesin" : "Tambah PIC Mesin"}</DialogTitle>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {/* min-w-0: isi panjang (nama user, kode mesin) tidak boleh melebarkan modal */}
        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label>User</Label>
            {isEdit ? (
              // User tidak bisa diganti saat edit; hapus lalu buat baru jika perlu
              <Input value={`${pic.user.name} (${pic.user.email})`} disabled />
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Pilih user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name} <span className="text-muted-foreground">({u.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FieldError messages={errors.userId} />
          </div>

          <div className="space-y-2">
            <Label>Kategori Aset</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((k) => (
                  <SelectItem key={k.id} value={String(k.id)}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Mesin</Label>
              {categoryId && visibleAssets.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="text-xs text-primary hover:underline"
                >
                  {allVisibleSelected ? "Batal pilih semua" : "Pilih semua"}
                </button>
              )}
            </div>

            <div className="rounded-md border">
              {categoryId && (
                <div className="relative border-b">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Cari kode atau model..."
                    className="rounded-none border-0 pl-9 shadow-none focus-visible:ring-0"
                  />
                </div>
              )}
              <div className="max-h-52 overflow-y-auto p-1">
                {!categoryId ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Pilih kategori aset terlebih dahulu
                  </p>
                ) : loadingAssets ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">Memuat...</p>
                ) : visibleAssets.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">Tidak ada mesin</p>
                ) : (
                  visibleAssets.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleAsset(a)}
                        className="size-4 accent-primary"
                      />
                      <span className="shrink-0 font-medium">{a.kode}</span>
                      {a.model && <span className="min-w-0 truncate text-muted-foreground">{a.model}</span>}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Mesin terpilih dari semua kategori */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{selected.length} mesin dipilih</p>
              {selected.length > 0 && (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {selected.map((a) => (
                    <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                      {a.kode}
                      <span className="text-muted-foreground">· {a.category.name}</span>
                      <button
                        type="button"
                        onClick={() => toggleAsset(a)}
                        className="rounded-sm p-0.5 hover:bg-background"
                        title="Hapus"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <FieldError messages={errors.assetIds} />
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
