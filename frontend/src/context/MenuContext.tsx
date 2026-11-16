import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import { menus as baseMenus, type MenuSource, type NavItem, type NavSubItem } from "@/config/menus";

type MenuContextValue = {
  menus: NavItem[];
  // Panggil setelah data kategori (aset / schedule) berubah supaya sidebar ikut ter-update
  reloadMenus: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

type Option = { id: number; name: string };

// Sumber submenu dinamis: endpoint API + alamat halaman tiap item
const sources: Record<MenuSource, { endpoint: string; to: (id: number) => string }> = {
  "kategori-aset": { endpoint: "/kategori-aset/all", to: (id) => `/data-asset/${id}` },
  "schedule-category": { endpoint: "/schedule-categories/all", to: (id) => `/schedule/kategori/${id}` },
};

const sourceKeys = Object.keys(sources) as MenuSource[];

// Menggabungkan menu statis (config/menus.ts) dengan submenu dari API
export function MenuProvider({ children }: { children: ReactNode }) {
  const [dynamicItems, setDynamicItems] = useState<Partial<Record<MenuSource, NavSubItem[]>>>({});

  const reloadMenus = useCallback(() => {
    for (const key of sourceKeys) {
      const { endpoint, to } = sources[key];
      api<Option[]>(endpoint)
        .then((data) => data.map((item) => ({ title: item.name, to: to(item.id) })))
        .catch(() => [])
        .then((items) => setDynamicItems((prev) => ({ ...prev, [key]: items })));
    }
  }, []);

  useEffect(reloadMenus, [reloadMenus]);

  const { user } = useAuth();
  const role = user?.role.code;

  // Submenu dari API tampil lebih dulu, lalu submenu statis (kalau ada).
  // Menu & submenu disaring sesuai role user (sama seperti menu per role di SIMFATI v1).
  const menus = useMemo(() => {
    const allowed = (roles?: string[]) => !roles || (!!role && roles.includes(role));
    return baseMenus
      .filter((menu) => allowed(menu.roles))
      .map((menu) => {
        const items = menu.source ? [...(dynamicItems[menu.source] ?? []), ...(menu.items ?? [])] : menu.items;
        return items ? { ...menu, items: items.filter((item) => allowed(item.roles)) } : menu;
      })
      // Grup yang semua submenunya tersaring tidak ditampilkan (kecuali grup dinamis yang masih memuat)
      .filter((menu) => !menu.items || menu.items.length > 0 || menu.source);
  }, [dynamicItems, role]);

  return <MenuContext.Provider value={{ menus, reloadMenus }}>{children}</MenuContext.Provider>;
}

export function useMenus() {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useMenus harus dipakai di dalam <MenuProvider>");
  return context;
}
