import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
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

  // Submenu dari API tampil lebih dulu, lalu submenu statis (kalau ada)
  const menus = useMemo(
    () =>
      baseMenus.map((menu) =>
        menu.source ? { ...menu, items: [...(dynamicItems[menu.source] ?? []), ...(menu.items ?? [])] } : menu
      ),
    [dynamicItems]
  );

  return <MenuContext.Provider value={{ menus, reloadMenus }}>{children}</MenuContext.Provider>;
}

export function useMenus() {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useMenus harus dipakai di dalam <MenuProvider>");
  return context;
}
