import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PicMesinFormModal from "../components/PicMesinFormModal";
import type { Paginated, PicMesin } from "../types";
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

export default function PicMesinPage() {
  const { user } = useAuth();
  // Tambah/edit/hapus hanya untuk admin (backend juga mengecek)
  const isAdmin = user?.role === "ADMIN";

  const [result, setResult] = useState<Paginated<PicMesin> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal: undefined = tertutup, null = tambah, PicMesin = edit
  const [editing, setEditing] = useState<PicMesin | null | undefined>(undefined);
  // Konfirmasi hapus: null = tertutup, PicMesin = data yang akan dihapus
  const [deleting, setDeleting] = useState<PicMesin | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page) });
      setResult(await api<Paginated<PicMesin>>(`/pic-mesin?${params}`));
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang data saat halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, page]);

  async function handleDelete(pic: PicMesin) {
    setError("");
    try {
      await api(`/pic-mesin/${pic.user.id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus data PIC mesin");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    loadData();
  }

  const colSpan = isAdmin ? 4 : 3;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">PIC Mesin</h1>
        {isAdmin && (
          <Button onClick={() => setEditing(null)}>
            <Plus /> Tambah PIC Mesin
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
              placeholder="Cari user atau kode mesin..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">User</TableHead>
              <TableHead className="px-4">Mesin</TableHead>
              <TableHead className="px-4">Jumlah</TableHead>
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
              result?.data.map((p) => (
                <TableRow key={p.user.id}>
                  <TableCell className="px-4 align-top">
                    <div className="font-medium">{p.user.name}</div>
                    <div className="text-xs text-muted-foreground">{p.user.email}</div>
                  </TableCell>
                  <TableCell className="px-4 whitespace-normal">
                    <div className="flex max-w-xl flex-wrap gap-1.5">
                      {p.assets.map((a) => (
                        <Badge key={a.id} variant="secondary" title={a.category.name}>
                          {a.kode}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 align-top text-muted-foreground">
                    {p.assets.length} mesin
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="px-4 align-top">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title="Edit">
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(p)}
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
            <span>Total {result.total} PIC</span>
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
        <PicMesinFormModal pic={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus PIC mesin?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua mesin ({deleting?.assets.length}) milik "{deleting?.user.name}" akan dilepas dari user ini.
              Data user dan mesin tidak ikut terhapus.
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
