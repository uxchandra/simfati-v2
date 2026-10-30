import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import ChecksheetItemsTable from "./ChecksheetItemsTable";
import type { Checksheet, ChecksheetDetail } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  checksheet: Checksheet;
  onClose: () => void;
};

export default function ChecksheetDetailModal({ checksheet, onClose }: Props) {
  const [detail, setDetail] = useState<ChecksheetDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ChecksheetDetail>(`/checksheets/${checksheet.id}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat checksheet"));
  }, [checksheet.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[min(1400px,95vw)]">
        <DialogHeader>
          <DialogTitle>{checksheet.name}</DialogTitle>
          <DialogDescription>
            {checksheet.category.name} · {checksheet.itemCount} poin pemeriksaan
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border">
          {detail ? (
            <ChecksheetItemsTable items={detail.items} />
          ) : (
            !error && <p className="py-8 text-center text-sm text-muted-foreground">Memuat...</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
