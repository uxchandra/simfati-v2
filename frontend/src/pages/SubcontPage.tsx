import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import SubcontFormModal from "../components/SubcontFormModal";
import type { Paginated, Subcont } from "../types";
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

export default function SubcontPage() {
  const { user } = useAuth();
  // Tambah/edit/hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";

  const [result, setResult] = useState<Paginated<Subcont> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal: undefined = tertutup, null = tambah, Subcont = edit
  const [editing, setEditing] = useState<Subcont | null | undefined>(undefined);
  // Konfirmasi hapus: null = tertutup, Subcont = data yang akan dihapus
  const [deleting, setDeleting] = useState<Subcont | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page) });
      setResult(await api<Paginated<Subcont>>(`/subcont?${params}`));
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang data saat halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, page]);

  async function handleDelete(subcont: Subcont) {
    setError("");
    try {
      await api(`/subcont/${subcont.id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus subcont");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    loadData();
  }

  const colSpan = isAdmin ? 6 : 5;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Subcont</h1>
        {isAdmin && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> Tambah Subcont
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
              placeholder="Cari nama, PIC, atau no. telp..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Nama</TableHead>
              <TableHead className="px-4">Alamat</TableHead>
              <TableHead className="px-4">No. Telp</TableHead>
              <TableHead className="px-4">PIC</TableHead>
              <TableHead className="px-4">Status</TableHead>
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
              result?.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="px-4 font-medium">{s.nama}</TableCell>
                  <TableCell className="max-w-xs truncate px-4 text-muted-foreground" title={s.alamat ?? ""}>
                    {s.alamat || "-"}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground">{s.noTelp || "-"}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">{s.pic || "-"}</TableCell>
                  <TableCell className="px-4">
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>
                      {s.status === "active" ? "Active" : "Inactive"}
                    </Badge>
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
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total {result.total} subcont</span>
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
        <SubcontFormModal
          subcont={editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus subcont?</AlertDialogTitle>
            <AlertDialogDescription>
              Subcont "{deleting?.nama}" akan dihapus permanen.
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
