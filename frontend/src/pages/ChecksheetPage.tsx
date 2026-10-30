import { useEffect, useState } from "react";
import { Download, Eye, Search, Trash2, Upload } from "lucide-react";
import { api, apiDownload, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import ChecksheetImportModal from "../components/ChecksheetImportModal";
import ChecksheetDetailModal from "../components/ChecksheetDetailModal";
import type { Checksheet, KategoriAset, Paginated } from "../types";
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

const ALL = "all";

export default function ChecksheetPage() {
  const { user } = useAuth();
  // Import/hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";

  const [result, setResult] = useState<Paginated<Checksheet> | null>(null);
  const [kategoriList, setKategoriList] = useState<Pick<KategoriAset, "id" | "name">[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState(ALL);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [importing, setImporting] = useState(false);
  const [viewing, setViewing] = useState<Checksheet | null>(null);
  const [deleting, setDeleting] = useState<Checksheet | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page) });
      if (categoryId !== ALL) params.set("categoryId", categoryId);
      setResult(await api<Paginated<Checksheet>>(`/checksheets?${params}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api<Pick<KategoriAset, "id" | "name">[]>("/kategori-aset/all")
      .then(setKategoriList)
      .catch(() => setKategoriList([]));
  }, []);

  // Ambil ulang data saat filter/halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, categoryId, page]);

  async function handleDelete(checksheet: Checksheet) {
    setError("");
    setSuccess("");
    try {
      await api(`/checksheets/${checksheet.id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus checksheet");
    }
  }

  async function handleDownloadTemplate() {
    setError("");
    try {
      await apiDownload("/checksheets/template", "template-checksheet.xlsx");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunduh template");
    }
  }

  function handleImported(message: string) {
    setImporting(false);
    setError("");
    setSuccess(message);
    loadData();
  }

  const colSpan = 5;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Checksheet</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download /> Download Template
          </Button>
          {isAdmin && (
            <Button onClick={() => setImporting(true)}>
              <Upload /> Import Excel
            </Button>
          )}
        </div>
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
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nama checksheet..."
              className="pl-9"
            />
          </div>
          <Select
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kategori</SelectItem>
              {kategoriList.map((k) => (
                <SelectItem key={k.id} value={String(k.id)}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 px-4">No</TableHead>
              <TableHead className="px-4">Nama Checksheet</TableHead>
              <TableHead className="px-4">Kategori Aset</TableHead>
              <TableHead className="px-4">Jumlah Poin</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
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
              result?.data.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="px-4 text-muted-foreground">
                    {(result.page - 1) * 10 + i + 1}
                  </TableCell>
                  <TableCell className="whitespace-normal px-4 font-medium">{c.name}</TableCell>
                  <TableCell className="px-4">{c.category.name}</TableCell>
                  <TableCell className="px-4">{c.itemCount}</TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewing(c)} title="Lihat poin">
                        <Eye />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(c)}
                          title="Hapus"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {result && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total {result.total} checksheet</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
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

      {importing && <ChecksheetImportModal onClose={() => setImporting(false)} onSaved={handleImported} />}

      {viewing && <ChecksheetDetailModal checksheet={viewing} onClose={() => setViewing(null)} />}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus checksheet?</AlertDialogTitle>
            <AlertDialogDescription>
              Checksheet "{deleting?.name}" beserta {deleting?.itemCount} poin pemeriksaannya akan dihapus
              permanen.
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
