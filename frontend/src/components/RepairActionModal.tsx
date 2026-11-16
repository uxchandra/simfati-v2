import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { ACTION_LABEL, textareaClass } from "../lib/checkup";
import type { FieldErrors, Paginated, RepairAction, RepairData, Sparepart } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  // Endpoint POST tindakan, mis. "/general-checkups/1/details/5/action" atau "/repair-requests/3/action"
  endpoint: string;
  data: RepairData;
  // Ditampilkan di bawah judul (poin NG / problem laporan)
  description: ReactNode;
  // Isi awal kolom problem untuk inhouse / outhouse
  defaultProblem: string;
  action: RepairAction;
  onClose: () => void;
  onSaved: (message: string) => void;
};

type PartItem = { sparepart: Sparepart; quantity: number; keterangan: string };

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages) return null;
  return <p className="text-xs text-destructive">{messages[0]}</p>;
}

// Form pilih / ubah tindakan penanganan (poin NG checkup atau repair request)
export default function RepairActionModal({
  endpoint,
  data: detail,
  description,
  defaultProblem,
  action: initialAction,
  onClose,
  onSaved,
}: Props) {
  const [action, setAction] = useState<RepairAction>(initialAction);

  // Inhouse & outhouse: problem diisi awal dari keterangan NG / problem laporan
  const [problem, setProblem] = useState(
    detail.inhouseRepair?.problem ?? detail.outhouseRepair?.problem ?? defaultProblem,
  );
  const [perbaikan, setPerbaikan] = useState(detail.inhouseRepair?.perbaikan ?? detail.outhouseRepair?.perbaikan ?? "");
  const [subcontId, setSubcontId] = useState(detail.outhouseRepair ? String(detail.outhouseRepair.subcont.id) : "");
  const [subconts, setSubconts] = useState<{ id: number; nama: string }[] | null>(null);

  // Ganti part: pencarian sparepart + daftar part baru yang akan diminta
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Sparepart[]>([]);
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<PartItem[]>([]);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (action !== "outhouse" || subconts) return;
    api<{ subconts: { id: number; nama: string }[] }>("/general-checkups/options")
      .then((res) => setSubconts(res.subconts))
      .catch(() => setMessage("Gagal memuat daftar subcont"));
  }, [action, subconts]);

  // Cari sparepart 300ms setelah berhenti mengetik
  useEffect(() => {
    if (action !== "ganti_part") return;
    const timer = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ search, perPage: "10" });
      api<Paginated<Sparepart>>(`/spareparts?${params}`)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, action]);

  // Ganti jenis tindakan menghapus data tindakan sebelumnya
  const switching = detail.repairAction !== null && detail.repairAction !== action;
  const addingParts = action === "ganti_part" && detail.repairAction === "ganti_part";

  function addPart(sparepart: Sparepart) {
    setItems((prev) =>
      prev.some((i) => i.sparepart.id === sparepart.id)
        ? prev.map((i) => (i.sparepart.id === sparepart.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...prev, { sparepart, quantity: 1, keterangan: "" }],
    );
  }

  function updateItem(id: number, patch: Partial<PartItem>) {
    setItems((prev) => prev.map((i) => (i.sparepart.id === id ? { ...i, ...patch } : i)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage("");

    const body =
      action === "ganti_part"
        ? {
            action,
            items: items.map((i) => ({ sparepartId: i.sparepart.id, quantity: i.quantity, keterangan: i.keterangan })),
          }
        : action === "outhouse"
          ? { action, subcontId, problem, perbaikan }
          : { action, problem, perbaikan };

    if (action === "ganti_part" && items.length === 0) {
      setMessage("Pilih minimal satu part dari hasil pencarian");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ message: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSaved(res.message);
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
          <DialogTitle>{addingParts ? "Tambah Part" : "Pilih Tindakan Perbaikan"}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>

        {/* Pilih jenis tindakan */}
        {!addingParts && (
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {(Object.keys(ACTION_LABEL) as RepairAction[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAction(value)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                  action === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ACTION_LABEL[value]}
              </button>
            ))}
          </div>
        )}

        {switching && (
          <Alert className="border-amber-500/40 text-amber-700 dark:text-amber-300">
            <AlertDescription>
              Tindakan sebelumnya ({ACTION_LABEL[detail.repairAction!]}) akan diganti dan datanya dihapus.
            </AlertDescription>
          </Alert>
        )}

        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {action === "ganti_part" ? (
            <>
              <div className="space-y-2">
                <Label>Cari sparepart</Label>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Kode, nama, atau spesifikasi..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 divide-y overflow-y-auto rounded-lg border">
                  {results.length === 0 ? (
                    <p className="p-3 text-center text-sm text-muted-foreground">
                      {searching ? "Mencari..." : "Sparepart tidak ditemukan"}
                    </p>
                  ) : (
                    results.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => addPart(sp)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{sp.kodeBarang}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[sp.namaBarang, sp.spec].filter(Boolean).join(" · ") || "-"}
                          </div>
                        </div>
                        <span className={cn("text-xs whitespace-nowrap", !sp.stok ? "text-destructive" : "text-muted-foreground")}>
                          Stok {sp.stok ?? 0} {sp.uom ?? ""}
                        </span>
                        <Plus className="size-4 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
              </div>

              {items.length > 0 && (
                <div className="space-y-2">
                  <Label>Part yang diminta</Label>
                  {items.map((item) => (
                    <div key={item.sparepart.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 text-sm">
                          <div className="font-medium">{item.sparepart.kodeBarang}</div>
                          <div className="truncate text-xs text-muted-foreground">{item.sparepart.namaBarang ?? "-"}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => updateItem(item.sparepart.id, { quantity: Math.max(1, item.quantity - 1) })}
                          >
                            <Minus />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(item.sparepart.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="h-7 w-14 text-center"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            onClick={() => updateItem(item.sparepart.id, { quantity: item.quantity + 1 })}
                          >
                            <Plus />
                          </Button>
                          <span className="w-8 text-xs text-muted-foreground">{item.sparepart.uom}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => setItems((prev) => prev.filter((i) => i.sparepart.id !== item.sparepart.id))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      {item.quantity > (item.sparepart.stok ?? 0) && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Stok saat ini {item.sparepart.stok ?? 0}. Part tetap bisa diminta, tapi baru bisa ditandai
                          terpasang setelah stok cukup.
                        </p>
                      )}
                      <Input
                        value={item.keterangan}
                        onChange={(e) => updateItem(item.sparepart.id, { keterangan: e.target.value })}
                        placeholder="Keterangan penggunaan (opsional)"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {action === "outhouse" && (
                <div className="space-y-2">
                  <Label>Subcont</Label>
                  <Select value={subcontId} onValueChange={setSubcontId} disabled={!subconts}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={subconts ? "Pilih subcont" : "Memuat..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {subconts?.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {subconts?.length === 0 && (
                    <p className="text-xs text-muted-foreground">Belum ada subcont aktif di Data Master → Subcont.</p>
                  )}
                  <FieldError messages={errors.subcontId} />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="problem">Problem</Label>
                <textarea
                  id="problem"
                  rows={2}
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="Kerusakan yang ditemukan"
                  aria-invalid={!!errors.problem}
                  className={textareaClass}
                />
                <FieldError messages={errors.problem} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="perbaikan">{action === "outhouse" ? "Perbaikan yang diminta" : "Perbaikan yang dilakukan"}</Label>
                <textarea
                  id="perbaikan"
                  rows={3}
                  value={perbaikan}
                  onChange={(e) => setPerbaikan(e.target.value)}
                  placeholder={action === "outhouse" ? "mis. Rewinding motor" : "mis. Ganti packing, kencangkan baut"}
                  aria-invalid={!!errors.perbaikan}
                  className={textareaClass}
                />
                <FieldError messages={errors.perbaikan} />
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Menyimpan..." : action === "outhouse" && !detail.outhouseRepair ? "Kirim ke Subcont" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
