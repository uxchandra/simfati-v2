import { groupByBagian } from "../lib/checksheet";
import type { ChecksheetItem } from "../types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  items: Pick<ChecksheetItem, "bagian" | "poin" | "metode" | "standar">[];
};

// Tabel poin pemeriksaan seperti form Excel: kolom NO & BAGIAN di-merge (rowSpan) sesuai jumlah poinnya.
// Dipakai di detail & preview import
export default function ChecksheetItemsTable({ items }: Props) {
  return (
    <Table className="[&_td]:border [&_th]:border">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-12 px-3 text-center">No</TableHead>
          <TableHead className="px-3">Bagian</TableHead>
          <TableHead className="px-3" colSpan={2}>
            Point Pemeriksaan
          </TableHead>
          <TableHead className="px-3">Methoda &amp; Alat Cek</TableHead>
          <TableHead className="px-3">Standar</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groupByBagian(items).map((group) =>
          group.items.map((item, i) => (
            // Hover dimatikan karena sel yang di-merge membuat highlight per baris terlihat janggal
            <TableRow key={item.kode} className="hover:bg-transparent">
              {i === 0 && (
                <>
                  <TableCell rowSpan={group.items.length} className="px-3 text-center align-top font-semibold">
                    {group.no}
                  </TableCell>
                  <TableCell rowSpan={group.items.length} className="whitespace-normal px-3 align-top font-semibold">
                    {group.bagian}
                  </TableCell>
                </>
              )}
              <TableCell className="w-12 px-3 align-top text-muted-foreground">{item.kode}</TableCell>
              <TableCell className="whitespace-normal px-3 align-top">{item.poin}</TableCell>
              <TableCell className="whitespace-normal px-3 align-top">{item.metode ?? "-"}</TableCell>
              <TableCell className="whitespace-normal px-3 align-top">{item.standar ?? "-"}</TableCell>
            </TableRow>
          )),
        )}
      </TableBody>
    </Table>
  );
}
