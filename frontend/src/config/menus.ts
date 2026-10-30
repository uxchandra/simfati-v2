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
  // Kalau diisi, submenu diambil dari API dan ditaruh sebelum `items` statis (lihat MenuContext)
  source?: MenuSource;
};

export type MenuSource = "kategori-aset" | "schedule-category";

// Daftar menu sidebar. Dipakai juga oleh breadcrumb di AdminLayout.
// Submenu di bawah ini masih CONTOH — ganti sesuai kebutuhan.
// Halaman yang belum dibuat otomatis menampilkan "Halaman belum tersedia".
export const menus: NavItem[] = [
  { title: "Dashboard", icon: LayoutDashboardIcon, to: "/" },
  {
    title: "Data Master",
    icon: DatabaseIcon,
    items: [
      { title: "Kategori Aset", to: "/data-master/kategori-aset" },
      { title: "Kategori Schedule", to: "/schedule/kategori" },
      { title: "Kategori Repair", to: "/data-master/kategori-repair" },
      { title: "Subcont", to: "/data-master/subcont" },
      { title: "PIC Mesin", to: "/data-master/pic-mesin" },
      { title: "Checksheet", to: "/data-master/checksheet" },
    ],
  },
  {
    title: "Sparepart",
    icon: CogIcon,
    items: [
      { title: "Daftar Sparepart", to: "/sparepart" },
      { title: "Warehouse PUD", to: "/sparepart/warehouse-pud" },
    ],
  },
  {
    title: "Data Asset",
    icon: BoxesIcon,
    // Submenu diisi otomatis dari data Kategori Aset (lihat MenuContext)
    source: "kategori-aset",
    items: [],
  },
  {
    title: "Schedule",
    icon: CalendarDaysIcon,
    // Submenu diisi otomatis dari data Kategori Schedule, item di bawah ini tampil setelahnya
    source: "schedule-category",
    items: [{ title: "Jadwal Preventive", to: "/schedule/preventive" }],
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
// `menus` dari useMenus() supaya submenu dinamis (mis. Data Asset) ikut terbaca
export function findMenuTrail(menus: NavItem[], pathname: string): string[] {
  for (const menu of menus) {
    if (menu.to === pathname) return [menu.title];

    const sub = menu.items?.find((item) => item.to === pathname);
    if (sub) return [menu.title, sub.title];
  }
  return [];
}
