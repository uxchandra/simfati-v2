import {
  BoxesIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  CogIcon,
  DatabaseIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  UserCogIcon,
  type LucideIcon,
} from "lucide-react";

export type NavSubItem = {
  title: string;
  to: string;
};

// Menu punya `to` (langsung jadi link) ATAU `items` (jadi grup yang bisa dibuka-tutup)
export type NavItem = {
  title: string;
  icon: LucideIcon;
  to?: string;
  items?: NavSubItem[];
};

// Daftar menu sidebar. Dipakai juga oleh breadcrumb di AdminLayout.
// Submenu di bawah ini masih CONTOH — ganti sesuai kebutuhan.
// Halaman yang belum dibuat otomatis menampilkan "Halaman belum tersedia".
export const menus: NavItem[] = [
  { title: "Dashboard", icon: LayoutDashboardIcon, to: "/" },
  {
    title: "Data Master",
    icon: DatabaseIcon,
    items: [
      { title: "Kategori", to: "/data-master/kategori" },
      { title: "Satuan", to: "/data-master/satuan" },
      { title: "Lokasi", to: "/data-master/lokasi" },
      { title: "Supplier", to: "/data-master/supplier" },
    ],
  },
  {
    title: "Sparepart",
    icon: CogIcon,
    items: [
      { title: "Daftar Sparepart", to: "/sparepart" },
      { title: "Stok Sparepart", to: "/sparepart/stok" },
    ],
  },
  {
    title: "Data Inventaris",
    icon: BoxesIcon,
    items: [
      { title: "Daftar Aset", to: "/inventaris" },
      { title: "Mutasi Aset", to: "/inventaris/mutasi" },
    ],
  },
  {
    title: "Schedule",
    icon: CalendarDaysIcon,
    items: [
      { title: "Jadwal Maintenance", to: "/schedule" },
      { title: "Kalender", to: "/schedule/kalender" },
    ],
  },
  {
    title: "Transaksi",
    icon: ClipboardListIcon,
    items: [
      { title: "Barang Masuk", to: "/transaksi/masuk" },
      { title: "Barang Keluar", to: "/transaksi/keluar" },
      { title: "Peminjaman", to: "/transaksi/peminjaman" },
    ],
  },
  {
    title: "History",
    icon: HistoryIcon,
    items: [
      { title: "Riwayat Maintenance", to: "/history/maintenance" },
      { title: "Riwayat Transaksi", to: "/history/transaksi" },
    ],
  },
  {
    title: "Report",
    icon: ChartColumnIcon,
    items: [
      { title: "Laporan Stok", to: "/report/stok" },
      { title: "Laporan Transaksi", to: "/report/transaksi" },
    ],
  },
  {
    title: "Manajemen User",
    icon: UserCogIcon,
    items: [
      { title: "Users", to: "/users" },
      { title: "Role & Akses", to: "/manajemen-user/role" },
    ],
  },
];

// Cari urutan judul untuk breadcrumb, mis. "/users" -> ["Manajemen User", "Users"]
export function findMenuTrail(pathname: string): string[] {
  for (const menu of menus) {
    if (menu.to === pathname) return [menu.title];

    const sub = menu.items?.find((item) => item.to === pathname);
    if (sub) return [menu.title, sub.title];
  }
  return [];
}
