import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ClipboardCheck, Image, Plus, Search } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { hasRole, ROLES } from "../lib/roles";
import { ACTION_LABEL, formatDateTime, OUTHOUSE_LABEL, RR_STATUS_CLASS, RR_STATUS_LABEL } from "../lib/checkup";
import RepairRequestFormModal from "../components/RepairRequestFormModal";
import type { RepairRequestList, RepairRequestStatus } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const TABS: RepairRequestStatus[] = ["pending", "in_progress", "completed", "cancelled"];
const TAB_LABEL: Record<RepairRequestStatus, string> = {
  pending: "Menunggu",
  in_progress: "Dikerjakan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export default function RepairRequestPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isLeader = hasRole(user, ROLES.AST_LEADER);

  // Tab status disimpan di URL supaya tidak ter-reset saat kembali dari halaman detail
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status") as RepairRequestStatus | null;
  const status: RepairRequestStatus = statusParam && TABS.includes(statusParam) ? statusParam : "pending";

  const [result, setResult] = useState<RepairRequestList | null>(null);
  // Kata kunci awal bisa dari URL, mis. dari dashboard: ?search=PT.61
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  function loadData() {
    const params = new URLSearchParams({ status, search, page: String(page) });
    return api<RepairRequestList>(`/repair-requests?${params}`)
      .then(setResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat repair request"));
  }

  // Ambil ulang saat tab / halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [status, search, page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Repair Request</h1>
          <p className="text-sm text-muted-foreground">
            {isLeader ? "Laporan kerusakan mesin yang Anda buat" : "Laporan kerusakan mesin di luar jadwal checkup"}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Lapor Kerusakan
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <div className="flex gap-1 overflow-x-auto border-b px-2">
          {TABS.map((value) => {
            const count = result?.counts[value] ?? 0;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSearchParams({ status: value }, { replace: true });
                  setPage(1);
                }}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  status === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB_LABEL[value]}
                <span
                  className={cn(
                    "rounded-full px-2 text-xs tabular-nums",
                    value === "pending" && count > 0 ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-muted text-muted-foreground",
                  )}
                >
                  {result ? count : "-"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-b p-4">
          <div className="relative max-w-sm">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari kode, mesin, problem, pelapor..."
              className="pl-9"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Kode</TableHead>
              <TableHead className="px-4">Dilaporkan</TableHead>
              <TableHead className="px-4">Mesin</TableHead>
              <TableHead className="px-4">Problem</TableHead>
              <TableHead className="px-4">Tindakan</TableHead>
              <TableHead className="px-4">Status</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!result ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {error ? "-" : "Memuat..."}
                </TableCell>
              </TableRow>
            ) : result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <ClipboardCheck className="mx-auto mb-2 size-8 opacity-40" />
                  Tidak ada repair request
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="px-4 font-mono text-sm">{r.kode}</TableCell>
                  <TableCell className="px-4">
                    <div>{formatDateTime(r.requestedAt)}</div>
                    <div className="text-xs text-muted-foreground">{r.requestedBy.name}</div>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="font-medium">{r.asset.kode}</div>
                    <div className="text-xs text-muted-foreground">{r.asset.category.name}</div>
                  </TableCell>
                  <TableCell className="max-w-72 px-4">
                    <p className="line-clamp-2 whitespace-normal">{r.problem}</p>
                    {r._count.photos > 0 && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Image className="size-3" /> {r._count.photos} foto
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 text-sm">
                    {r.repairAction ? (
                      <>
                        <div>{ACTION_LABEL[r.repairAction]}</div>
                        {r.outhouseRepair && (
                          <div className="text-xs text-muted-foreground">{OUTHOUSE_LABEL[r.outhouseRepair.status]}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4">
                    <Badge className={cn("border-transparent", RR_STATUS_CLASS[r.status])}>{RR_STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/transaksi/repair-request/${r.id}`}>Detail</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {result && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total {result.total} laporan</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Sebelumnya
              </Button>
              <span>
                {result.page} / {result.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= result.totalPages} onClick={() => setPage(page + 1)}>
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </Card>

      {creating && (
        <RepairRequestFormModal
          isLeader={isLeader}
          onClose={() => setCreating(false)}
          // Langsung ke halaman detail supaya pelapor bisa menambahkan foto
          onSaved={(id) => navigate(`/transaksi/repair-request/${id}`, { state: { created: true } })}
        />
      )}
    </div>
  );
}
