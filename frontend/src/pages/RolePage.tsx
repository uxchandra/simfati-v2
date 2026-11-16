import { useEffect, useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import RoleFormModal from "../components/RoleFormModal";
import type { Role } from "../types";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Halaman ini hanya bisa dibuka superadmin (backend menolak role lain dengan 403)
export default function RolePage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [error, setError] = useState("");

  // Modal: undefined = tertutup, null = tambah, Role = edit
  const [editing, setEditing] = useState<Role | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Role | null>(null);

  function loadData() {
    return api<Role[]>("/roles")
      .then(setRoles)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data role"));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleDelete(role: Role) {
    setError("");
    try {
      await api(`/roles/${role.id}`, { method: "DELETE" });
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus role");
    }
  }

  function handleSaved() {
    setEditing(undefined);
    loadData();
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Role & Akses</h1>
        <Button onClick={() => setEditing(null)}>
          <Plus /> Tambah Role
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Nama</TableHead>
              <TableHead className="px-4">Kode</TableHead>
              <TableHead className="px-4">Deskripsi</TableHead>
              <TableHead className="px-4 text-right">Jumlah User</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!roles ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {error ? "-" : "Memuat..."}
                </TableCell>
              </TableRow>
            ) : (
              roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="px-4 font-medium">
                    <span className="flex items-center gap-2">
                      {r.name}
                      {r.isSystem && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="size-3" /> Sistem
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 font-mono text-sm text-muted-foreground">{r.code}</TableCell>
                  <TableCell className="px-4 whitespace-normal text-muted-foreground">
                    {r.description || "-"}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums">{r.userCount}</TableCell>
                  <TableCell className="px-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(r)} title="Edit">
                        <Pencil />
                      </Button>
                      {!r.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(r)}
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

        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          Role bertanda <span className="font-medium">Sistem</span> dipakai untuk mengatur hak akses menu, jadi tidak
          bisa dihapus dan kodenya tidak bisa diubah. Namanya tetap boleh diganti.
        </div>
      </Card>

      {editing !== undefined && (
        <RoleFormModal role={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus role?</AlertDialogTitle>
            <AlertDialogDescription>Role "{deleting?.name}" akan dihapus permanen.</AlertDialogDescription>
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
