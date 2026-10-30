import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router";
import { Eye, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useMenus } from "../context/MenuContext";
import { findMenuTrail } from "@/config/menus";
import AssetFormModal from "../components/AssetFormModal";
import AssetImportModal from "../components/AssetImportModal";
import type { Asset, Paginated } from "../types";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Route: /data-asset/:categoryId — satu halaman dipakai semua submenu Data Asset.
// `key` membuat state (search, page) ter-reset saat pindah ke kategori lain.
export default function AssetPage() {
  const { categoryId } = useParams();
  return <AssetList key={categoryId} categoryId={Number(categoryId)} />;
}

function AssetList({ categoryId }: { categoryId: number }) {
  const { user } = useAuth();
  // Tambah/edit/hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";

  // Judul halaman = nama kategori dari submenu, mis. "Mesin Press"
  const { pathname } = useLocation();
  const { menus } = useMenus();
  const title = findMenuTrail(menus, pathname).at(-1) ?? "Data Asset";

  const [result, setResult] = useState<Paginated<Asset> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importing, setImporting] = useState(false);

  // Modal: undefined = tertutup, null = tambah, Asset = edit
  const [editing, setEditing] = useState<Asset | null | undefined>(undefined);
  // Modal detail (hanya lihat)
  const [viewing, setViewing] = useState<Asset | null>(null);
  // Konfirmasi hapus: null = tertutup, Asset = data yang akan dihapus
  const [deleting, setDeleting] = useState<Asset | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        categoryId: String(categoryId),
        search,
        page: String(page),
      });
      setResult(await api<Paginated<Asset>>(`/assets?${params}`));
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang data saat halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, page]);

  async function handleDelete(asset: Asset) {
    setError("");
    try {
      await api(`/assets/${asset.id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus asset");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    loadData();
  }

  function handleImported(message: string) {
    setImporting(false);
    setError("");
    setSuccess(message);
    loadData();
  }

  const colSpan = 7;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button className="bg-green-600 text-white hover:bg-green-700" onClick={() => setImporting(true)}>
              <FileSpreadsheet /> Import Excel
            </Button>
            <Button onClick={() => setEditing(null)}>
              <Plus /> Tambah Asset
            </Button>
          </div>
        )}
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
        <div className="border-b p-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari kode, model, nomor seri, lane..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Kode</TableHead>
              <TableHead className="px-4">Model</TableHead>
              <TableHead className="px-4">Nomor Seri</TableHead>
              <TableHead className="px-4">Lane</TableHead>
              <TableHead className="px-4">Kapasitas</TableHead>
              <TableHead className="px-4">Status</TableHead>
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
              result?.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="px-4 font-medium">{a.kode}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">{a.model || "-"}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">{a.nomorSeri || "-"}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">{a.lane || "-"}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">{a.kapasitas || "-"}</TableCell>
                  <TableCell className="px-4">
                    <Badge variant={a.status === "active" ? "default" : "secondary"}>
                      {a.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewing(a)} title="Detail">
                        <Eye />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setEditing(a)} title="Edit">
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(a)}
                            title="Hapus"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 />
                          </Button>
                        </>
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
            <span>Total {result.total} asset</span>
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

      {importing && (
        <AssetImportModal
          categoryId={categoryId}
          categoryName={title}
          onClose={() => setImporting(false)}
          onSaved={handleImported}
        />
      )}

      {editing !== undefined && (
        <AssetFormModal
          asset={editing}
          categoryId={categoryId}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}

      {viewing && (
        <AssetFormModal
          asset={viewing}
          categoryId={categoryId}
          readOnly
          onClose={() => setViewing(null)}
          onSaved={() => setViewing(null)}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Asset "{deleting?.kode}" akan dihapus permanen.
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
