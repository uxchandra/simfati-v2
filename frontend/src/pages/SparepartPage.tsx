import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  FileSpreadsheet,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import SparepartFormModal from "../components/SparepartFormModal";
import SparepartImportModal from "../components/SparepartImportModal";
import type { Paginated, Sparepart, SparepartStats, StockStatus } from "../types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Sama dengan aturan di backend: habis = stok kosong/0, low = stok ≤ minimal stok
function stockStatus(s: Sparepart): StockStatus {
  if (!s.stok || s.stok <= 0) return "habis";
  if (s.minimalStok !== null && s.stok <= s.minimalStok) return "low";
  return "aman";
}

const stockColor: Record<StockStatus, string> = {
  aman: "text-green-600 dark:text-green-500",
  low: "text-amber-600 dark:text-amber-500",
  habis: "text-destructive",
};

const statCards: { key: keyof SparepartStats; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "total", label: "Total Sparepart", icon: Package, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { key: "aman", label: "Stok Aman", icon: CircleCheck, tone: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { key: "low", label: "Low Stock", icon: AlertTriangle, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "habis", label: "Stok Habis", icon: CircleX, tone: "bg-red-500/10 text-red-600 dark:text-red-400" },
];

const PER_PAGE_OPTIONS = ["10", "25", "50", "100"];

export default function SparepartPage() {
  const { user } = useAuth();
  // Tambah/edit/hapus/import hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";

  const [result, setResult] = useState<Paginated<Sparepart> | null>(null);
  const [stats, setStats] = useState<SparepartStats | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockStatus | "all">("all");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal: undefined = tertutup, null = tambah, Sparepart = edit
  const [editing, setEditing] = useState<Sparepart | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Sparepart | null>(null);
  const [importing, setImporting] = useState(false);
  const [qrOf, setQrOf] = useState<Sparepart | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page), perPage });
      if (status !== "all") params.set("status", status);
      setResult(await api<Paginated<Sparepart>>(`/spareparts?${params}`));
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStats(await api<SparepartStats>("/spareparts/stats"));
  }

  function reload() {
    loadData();
    loadStats();
  }

  useEffect(() => {
    loadStats();
  }, []);

  // Ambil ulang data saat filter/halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, status, perPage, page]);

  async function handleDelete(sparepart: Sparepart) {
    setError("");
    setSuccess("");
    try {
      await api(`/spareparts/${sparepart.id}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus sparepart");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    reload();
  }

  function handleImported(message: string) {
    setImporting(false);
    setError("");
    setSuccess(message);
    reload();
  }

  const colSpan = isAdmin ? 9 : 8;
  const startNo = result ? (result.page - 1) * Number(perPage) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Data Sparepart Internal</h1>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button className="bg-green-600 text-white hover:bg-green-700" onClick={() => setImporting(true)}>
              <FileSpreadsheet /> Import Excel
            </Button>
            <Button onClick={() => setEditing(null)}>
              <Plus /> Tambah Sparepart
            </Button>
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ key, label, icon: Icon, tone }) => (
          <Card key={key} className="flex-row items-center gap-4 px-6 py-5">
            <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", tone)}>
              <Icon className="size-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">{stats ? stats[key].toLocaleString("id-ID") : "-"}</p>
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="mb-4">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Show</span>
            <Select
              value={perPage}
              onValueChange={(value) => {
                setPerPage(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>entries</span>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as StockStatus | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Stok</SelectItem>
                <SelectItem value="aman">Stok Aman</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="habis">Stok Habis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nama / kode / spec..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 px-4">No</TableHead>
              <TableHead className="px-4 text-center">Kode</TableHead>
              <TableHead className="px-4">Nama Sparepart</TableHead>
              <TableHead className="px-4">Spec</TableHead>
              <TableHead className="px-4 text-center">Min. Stok</TableHead>
              <TableHead className="px-4 text-center">Maks. Stok</TableHead>
              <TableHead className="px-4 text-center">Stok</TableHead>
              <TableHead className="px-4">Keterangan</TableHead>
              {isAdmin && <TableHead className="px-4 text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !result ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  Memuat...
                </TableCell>
              </TableRow>
            ) : result?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                  Tidak ada data
                </TableCell>
              </TableRow>
            ) : (
              result?.data.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="px-4 text-muted-foreground">{startNo + i + 1}</TableCell>
                  <TableCell className="px-4">
                    {/* Klik QR untuk memperbesar (mudah di-scan / dicetak) */}
                    <button
                      type="button"
                      onClick={() => setQrOf(s)}
                      className="mx-auto flex flex-col items-center gap-1 rounded-sm p-1 hover:bg-accent"
                      title="Perbesar QR code"
                    >
                      <QRCodeSVG value={s.kodeBarang} size={52} marginSize={0} className="bg-white" />
                      <span className="font-mono text-xs">{s.kodeBarang}</span>
                    </button>
                  </TableCell>
                  <TableCell className="px-4 font-medium whitespace-normal">{s.namaBarang || "-"}</TableCell>
                  <TableCell className="px-4 whitespace-normal text-muted-foreground">
                    {s.spec || "-"}
                  </TableCell>
                  <TableCell className="px-4 text-center tabular-nums">{s.minimalStok ?? "-"}</TableCell>
                  <TableCell className="px-4 text-center tabular-nums">{s.maksimalStok ?? "-"}</TableCell>
                  <TableCell className={cn("px-4 text-center font-semibold tabular-nums", stockColor[stockStatus(s)])}>
                    {s.stok ?? 0}
                    {s.uom && <span className="ml-1 text-xs font-normal text-muted-foreground">{s.uom}</span>}
                  </TableCell>
                  <TableCell className="max-w-xs px-4 text-xs whitespace-normal text-muted-foreground">
                    {s.keterangan || "-"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="px-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(s)} title="Edit">
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(s)}
                          title="Hapus"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {result && (
          <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {result.total === 0
                ? "Tidak ada data"
                : `Menampilkan ${startNo + 1}–${startNo + result.data.length} dari ${result.total} sparepart`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </Button>
              <span>
                {result.page} / {result.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= result.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </Card>

      {editing !== undefined && (
        <SparepartFormModal sparepart={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}

      {importing && <SparepartImportModal onClose={() => setImporting(false)} onSaved={handleImported} />}

      <Dialog open={qrOf !== null} onOpenChange={(open) => !open && setQrOf(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-mono">{qrOf?.kodeBarang}</DialogTitle>
            <DialogDescription>{qrOf?.namaBarang || "-"}</DialogDescription>
          </DialogHeader>
          {qrOf && (
            <div className="flex justify-center rounded-md bg-white p-4">
              <QRCodeSVG value={qrOf.kodeBarang} size={220} marginSize={0} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus sparepart?</AlertDialogTitle>
            <AlertDialogDescription>
              Sparepart "{deleting?.kodeBarang}
              {deleting?.namaBarang ? ` - ${deleting.namaBarang}` : ""}" akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && handleDelete(deleting)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
