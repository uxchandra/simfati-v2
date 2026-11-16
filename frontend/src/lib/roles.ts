import type { User } from "../types";

// Code role sistem, harus sama dengan backend/src/lib/roles.ts
export const ROLES = {
  SUPERADMIN: "superadmin",
  AST_LEADER: "ast_leader",
  MEKANIK: "mekanik",
  SUBCONT: "subcont",
} as const;

export function hasRole(user: User | null | undefined, ...roles: string[]) {
  return !!user && roles.includes(user.role.code);
}

// Tambah/edit/hapus data master hanya untuk superadmin (backend juga mengecek)
export const isAdmin = (user: User | null | undefined) => hasRole(user, ROLES.SUPERADMIN);
