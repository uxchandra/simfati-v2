// Code role sistem (tabel roles, kolom code). Hak akses di kode selalu dicek lewat code ini,
// bukan lewat nama, supaya mengganti nama role di halaman Role & Akses tidak merusak akses.
export const ROLES = {
  SUPERADMIN: "superadmin",
  AST_LEADER: "ast_leader",
  MEKANIK: "mekanik",
  SUBCONT: "subcont",
} as const;

export type SystemRoleCode = (typeof ROLES)[keyof typeof ROLES];

// Data awal role sistem, dipakai seed (migration create_roles juga mengisi data yang sama)
export const SYSTEM_ROLES: { code: SystemRoleCode; name: string; description: string }[] = [
  { code: ROLES.SUPERADMIN, name: "Super Admin", description: "Akses penuh ke semua menu" },
  { code: ROLES.AST_LEADER, name: "Ast. Leader", description: "Melihat mesin dan membuat repair request" },
  { code: ROLES.MEKANIK, name: "Mekanik", description: "Mengerjakan general checkup dan repair" },
  { code: ROLES.SUBCONT, name: "Subcont", description: "Mengerjakan repair dari perusahaan subcont" },
];
