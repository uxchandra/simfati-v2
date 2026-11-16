// Kolom user yang boleh dikirim ke frontend (password TIDAK ikut)
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: { select: { id: true, code: true, name: true } },
  subcont: { select: { id: true, nama: true } },
  createdAt: true,
} as const;
