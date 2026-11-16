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
  WrenchIcon,
  MonitorIcon,
  type LucideIcon,
} from "lucide-react";
import { ROLES } from "@/lib/roles";

export type NavSubItem = {
  title: string;
  to: string;
  // Role yang boleh melihat submenu ini. Kosong = ikut role menu induknya
  roles?: string[];
};

// Menu punya `to` (langsung jadi link) ATAU `items` (jadi grup yang bisa dibuka-tutup)
export type NavItem = {
  title: string;
  icon: LucideIcon;
  to?: string;
  items?: NavSubItem[];
  // Kalau diisi, submenu diambil dari API dan ditaruh sebelum `items` statis (lihat MenuContext)
  source?: MenuSource;
  // Role yang boleh melihat menu ini (code role, lihat lib/roles.ts). Kosong = semua role
  roles?: string[];
};

const { SUPERADMIN, AST_LEADER, MEKANIK, SUBCONT } = ROLES;

export type MenuSource = "kategori-aset" | "schedule-category";

// Daftar menu sidebar. Dipakai juga oleh breadcrumb di AdminLayout.
// Submenu di bawah ini masih CONTOH — ganti sesuai kebutuhan.
// Halaman yang belum dibuat otomatis menampilkan "Halaman belum tersedia".
export const menus: NavItem[] = [
  { title: "Dashboard", icon: LayoutDashboardIcon, to: "/" },
  {
    title: "Data Master",
    icon: DatabaseIcon,
    roles: [SUPERADMIN],
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
    roles: [SUPERADMIN, MEKANIK],
    items: [
      { title: "Daftar Sparepart", to: "/sparepart" },
      { title: "Warehouse PUD", to: "/sparepart/warehouse-pud", roles: [SUPERADMIN] },
    ],
  },
  {
    title: "Data Asset",
    icon: BoxesIcon,
    roles: [SUPERADMIN, AST_LEADER, MEKANIK],
    // Submenu diisi otomatis dari data Kategori Aset (lihat MenuContext)
    source: "kategori-aset",
    items: [],
  },
  {
    title: "Schedule",
    icon: CalendarDaysIcon,
    roles: [SUPERADMIN, MEKANIK],
    // Submenu diisi otomatis dari data Kategori Schedule, item di bawah ini tampil setelahnya
    source: "schedule-category",
    items: [{ title: "Jadwal Preventive", to: "/schedule/preventive" }],
  },
  // Khusus akun subcont: outhouse repair dari general checkup
  { title: "Repair Request", icon: WrenchIcon, to: "/subcont/repair", roles: [SUBCONT] },
  {
    title: "Transaksi",
    icon: ClipboardListIcon,
    roles: [SUPERADMIN, MEKANIK, AST_LEADER],
    items: [
      { title: "General Checkup", to: "/transaksi/general-checkup", roles: [SUPERADMIN, MEKANIK] },
      { title: "Repair Request", to: "/transaksi/repair-request" },
    ],
  },
  // Papan andon untuk layar TV (tampil penuh tanpa sidebar)
  {
    title: "Andon",
    icon: MonitorIcon,
    roles: [SUPERADMIN, MEKANIK, AST_LEADER],
    items: [
      { title: "General Checkup", to: "/andon/general-checkup" },
      { title: "Repair Request", to: "/andon/repair-request" },
    ],
  },
  {
    title: "History",
    icon: HistoryIcon,
    roles: [SUPERADMIN, MEKANIK],
    items: [{ title: "General Checkup", to: "/history/general-checkup" }],
  },
  {
    title: "Report",
    icon: ChartColumnIcon,
    roles: [SUPERADMIN],
    items: [
      { title: "Laporan Stok", to: "/report/stok" },
      { title: "Laporan Transaksi", to: "/report/transaksi" },
    ],
  },
  {
    title: "Manajemen User",
    icon: UserCogIcon,
    roles: [SUPERADMIN],
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
  // Halaman turunan, mis. "/transaksi/general-checkup/5" -> ["Transaksi", "General Checkup", "Detail"]
  for (const menu of menus) {
    const sub = menu.items?.find((item) => pathname.startsWith(item.to + "/"));
    if (sub) return [menu.title, sub.title, "Detail"];
  }
  return [];
}
