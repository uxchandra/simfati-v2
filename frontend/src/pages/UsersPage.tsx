import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import UserFormModal from "../components/UserFormModal";
import type { Paginated, User } from "../types";
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

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [result, setResult] = useState<Paginated<User> | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal: undefined = tertutup, null = tambah, User = edit
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  // Konfirmasi hapus: null = tertutup, User = user yang akan dihapus
  const [deleting, setDeleting] = useState<User | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page) });
      setResult(await api<Paginated<User>>(`/users?${params}`));
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang data saat halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadUsers, 400);
    return () => clearTimeout(timer);
  }, [search, page]);

  async function handleDelete(user: User) {
    setError("");
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus user");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    loadUsers();
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={() => setEditing(null)}>
          <Plus /> Tambah User
        </Button>
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
              placeholder="Cari nama atau email..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Nama</TableHead>
              <TableHead className="px-4">Email</TableHead>
              <TableHead className="px-4">Role</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !result ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Memuat...
                </TableCell>
              </TableRow>
            ) : result?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Tidak ada data
                </TableCell>
              </TableRow>
            ) : (
              result?.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="px-4 font-medium">{u.name}</TableCell>
                  <TableCell className="px-4 text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="px-4">
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title="Edit">
                        <Pencil />
                      </Button>
                      {u.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(u)}
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
            <span>Total {result.total} user</span>
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
        <UserFormModal user={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}

      {/* Pengganti confirm() bawaan browser */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus user?</AlertDialogTitle>
            <AlertDialogDescription>
              User "{deleting?.name}" akan dihapus permanen.
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
