import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useMenus } from "../context/MenuContext";
import CategoryFormModal from "../components/CategoryFormModal";
import type { Category, Paginated } from "../types";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  title: string; // mis. "Kategori Schedule"
  endpoint: string; // mis. "/schedule-categories"
};

// Halaman CRUD kategori sederhana (hanya kolom nama), dipakai Kategori Schedule & Kategori Repair
export default function CategoryPage({ title, endpoint }: Props) {
  const { user } = useAuth();
  // Tambah/edit/hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";
  // Kategori Schedule menjadi submenu Schedule, jadi sidebar perlu di-refresh setelah data berubah
  const { reloadMenus } = useMenus();

  const [result, setResult] = useState<Paginated<Category> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal: undefined = tertutup, null = tambah, Category = edit
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  // Konfirmasi hapus: null = tertutup, Category = data yang akan dihapus
  const [deleting, setDeleting] = useState<Category | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page) });
      setResult(await api<Paginated<Category>>(`${endpoint}?${params}`));
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang data saat halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, page]);

  async function handleDelete(kategori: Category) {
    setError("");
    try {
      await api(`${endpoint}/${kategori.id}`, { method: "DELETE" });
      loadData();
      reloadMenus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus kategori");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    loadData();
    reloadMenus();
  }

  const colSpan = isAdmin ? 3 : 2;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        {isAdmin && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> Tambah {title}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
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
              placeholder="Cari nama kategori..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 px-4">No</TableHead>
              <TableHead className="px-4">Nama</TableHead>
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
              result?.data.map((k, i) => (
                <TableRow key={k.id}>
                  <TableCell className="px-4 text-muted-foreground">
                    {(result.page - 1) * 10 + i + 1}
                  </TableCell>
                  <TableCell className="px-4 font-medium">{k.name}</TableCell>
                  {isAdmin && (
                    <TableCell className="px-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(k)} title="Edit">
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(k)}
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
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total {result.total} kategori</span>
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

      {editing !== undefined && (
        <CategoryFormModal
          title={title}
          endpoint={endpoint}
          category={editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {title.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategori "{deleting?.name}" akan dihapus permanen.
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
