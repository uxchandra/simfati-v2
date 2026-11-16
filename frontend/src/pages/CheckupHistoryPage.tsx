import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime, formatDuration, formatPeriod } from "../lib/checkup";
import CheckupStatusBadge from "../components/CheckupStatusBadge";
import type { CheckupSummary, KategoriAset, Paginated } from "../types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function CheckupHistoryPage() {
  const [result, setResult] = useState<Paginated<CheckupSummary> | null>(null);
  const [categories, setCategories] = useState<KategoriAset[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  // Filter status awal bisa dari URL, mis. dari kartu dashboard: ?status=completed
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => {
    const initial = searchParams.get("status");
    return initial === "completed" || initial === "on_progress" ? initial : "all";
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<KategoriAset[]>("/kategori-aset/all").then(setCategories).catch(() => {});
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page) });
      if (categoryId !== "all") params.set("categoryId", categoryId);
      if (status !== "all") params.set("status", status);
      setResult(await api<Paginated<CheckupSummary>>(`/general-checkups/history?${params}`));
    } finally {
      setLoading(false);
    }
  }

  // Ambil ulang data saat filter / halaman berubah, atau 400ms setelah berhenti mengetik
  useEffect(() => {
    const timer = setTimeout(loadData, 400);
    return () => clearTimeout(timer);
  }, [search, categoryId, status, page]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">History General Checkup</h1>

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari kode checkup, mesin, atau nama..."
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
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="completed">Selesai</SelectItem>
              <SelectItem value="on_progress">Belum selesai</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Kode</TableHead>
              <TableHead className="px-4">Tanggal</TableHead>
              <TableHead className="px-4">Mesin</TableHead>
              <TableHead className="px-4">Jadwal</TableHead>
              <TableHead className="px-4">Dikerjakan oleh</TableHead>
              <TableHead className="px-4">Hasil</TableHead>
              <TableHead className="px-4">Durasi</TableHead>
              <TableHead className="px-4">Status</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !result ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Memuat...
                </TableCell>
              </TableRow>
            ) : result?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Belum ada riwayat checkup
                </TableCell>
              </TableRow>
            ) : (
              result?.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="px-4 font-mono text-sm">{c.kode}</TableCell>
                  <TableCell className="px-4">{formatDateTime(c.startedAt)}</TableCell>
                  <TableCell className="px-4">
                    <div className="font-medium">{c.asset.kode}</div>
                    <div className="text-xs text-muted-foreground">{c.asset.category.name}</div>
                  </TableCell>
                  <TableCell className="px-4 text-sm">{c.schedule ? formatPeriod(c.schedule) : "-"}</TableCell>
                  <TableCell className="px-4">{c.user.name}</TableCell>
                  <TableCell className="px-4 text-sm whitespace-nowrap">
                    <span className="text-emerald-600 dark:text-emerald-400">{c.counts.ok} OK</span>
                    {" · "}
                    <span className={c.counts.ng > 0 ? "text-destructive" : "text-muted-foreground"}>{c.counts.ng} NG</span>
                  </TableCell>
                  <TableCell className="px-4 text-sm">
                    {c.completedAt ? formatDuration(c.startedAt, c.completedAt) : "-"}
                  </TableCell>
                  <TableCell className="px-4">
                    <CheckupStatusBadge checkup={c} />
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/transaksi/general-checkup/${c.id}`}>Detail</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {result && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Total {result.total} checkup</span>
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
    </div>
  );
}
