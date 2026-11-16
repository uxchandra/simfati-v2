import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Search } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { textareaClass } from "../lib/checkup";
import type { FieldErrors, RepairRequestAsset } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  // Ast. Leader hanya melihat mesin PIC-nya (backend yang menyaring)
  isLeader: boolean;
  onClose: () => void;
  onSaved: (id: number, message: string) => void;
};

// Form lapor kerusakan mesin
export default function RepairRequestFormModal({ isLeader, onClose, onSaved }: Props) {
  const [assets, setAssets] = useState<RepairRequestAsset[] | null>(null);
  const [search, setSearch] = useState("");
  const [assetId, setAssetId] = useState<number | null>(null);
  const [problem, setProblem] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<RepairRequestAsset[]>("/repair-requests/options/assets")
      .then(setAssets)
      .catch(() => setMessage("Gagal memuat daftar mesin"));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = assets ?? [];
    if (!q) return list;
    return list.filter((a) =>
      [a.kode, a.description, a.lane, a.category.name].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [assets, search]);

  const selected = assets?.find((a) => a.id === assetId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");
    setSubmitting(true);
    try {
      const res = await api<{ id: number; message: string }>("/repair-requests", {
        method: "POST",
        body: JSON.stringify({ assetId, problem }),
      });
      onSaved(res.id, res.message);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lapor Kerusakan</DialogTitle>
          <DialogDescription>Foto kerusakan bisa ditambahkan setelah laporan dibuat.</DialogDescription>
        </DialogHeader>

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Mesin</Label>
            {selected ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{selected.kode}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[selected.description, selected.category.name].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAssetId(null)}>
                  Ganti
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari kode, nama mesin, lane..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                  {!assets ? (
                    <p className="p-3 text-center text-sm text-muted-foreground">Memuat...</p>
                  ) : filtered.length === 0 ? (
                    <p className="p-3 text-center text-sm text-muted-foreground">
                      {assets.length === 0 && isLeader
                        ? "Anda belum menjadi PIC mesin mana pun. Hubungi admin untuk diatur di menu PIC Mesin."
                        : "Mesin tidak ditemukan"}
                    </p>
                  ) : (
                    filtered.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAssetId(a.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted",
                          a.id === assetId && "bg-muted",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{a.kode}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[a.description, a.lane && `Lane ${a.lane}`, a.category.name].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {a.id === assetId && <Check className="size-4" />}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
            {errors.assetId && <p className="text-xs text-destructive">{errors.assetId[0]}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="problem">Deskripsi problem</Label>
            <textarea
              id="problem"
              rows={4}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Jelaskan kerusakan: gejala, kapan terjadi, bagian yang bermasalah"
              aria-invalid={!!errors.problem}
              className={textareaClass}
            />
            {errors.problem && <p className="text-xs text-destructive">{errors.problem[0]}</p>}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting || !assetId}>
              {submitting ? "Mengirim..." : "Kirim Laporan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
