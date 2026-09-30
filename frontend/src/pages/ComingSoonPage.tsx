import { ConstructionIcon } from "lucide-react";
import { useLocation } from "react-router";
import { findMenuTrail } from "@/config/menus";

// Ditampilkan untuk menu yang halamannya belum dibuat
export default function ComingSoonPage() {
  const { pathname } = useLocation();
  const title = findMenuTrail(pathname).at(-1) ?? "Halaman tidak ditemukan";

  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <ConstructionIcon className="size-10 text-muted-foreground" />
        <p className="mt-4 font-medium">Halaman belum tersedia</p>
        <p className="mt-1 text-sm text-muted-foreground">Fitur ini sedang dalam pengembangan.</p>
      </div>
    </div>
  );
}
