import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { ROLES } from "../lib/roles";

export type AuthUser = {
  id: number;
  // Code role (mis. "superadmin", "mekanik"), lihat src/lib/roles.ts
  role: string;
  // Terisi hanya untuk user role subcont
  subcontId: number | null;
};

// Tambahkan properti "user" ke tipe Request milik Express
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Wajib login: cek token JWT di header Authorization.
// Role diambil ulang dari database setiap request, supaya perubahan role / user yang dihapus
// langsung berlaku tanpa menunggu token kadaluarsa.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Silakan login terlebih dahulu" });
  }

  let userId: number;
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { id: number };
    userId = payload.id;
  } catch {
    return res.status(401).json({ message: "Sesi berakhir, silakan login ulang" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, subcontId: true, role: { select: { code: true } } },
  });
  if (!user) {
    return res.status(401).json({ message: "Sesi berakhir, silakan login ulang" });
  }

  req.user = { id: user.id, role: user.role.code, subcontId: user.subcontId };
  next();
}

// Wajib salah satu role tertentu (dipakai setelah requireAuth), mis. requireRole(ROLES.MEKANIK)
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Akses ditolak" });
    }
    next();
  };
}

// Wajib role superadmin (dipakai setelah requireAuth)
export const requireAdmin = requireRole(ROLES.SUPERADMIN);
