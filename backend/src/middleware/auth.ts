import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = {
  id: number;
  role: "ADMIN" | "USER";
};

// Tambahkan properti "user" ke tipe Request milik Express
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Wajib login: cek token JWT di header Authorization
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Silakan login terlebih dahulu" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ message: "Sesi berakhir, silakan login ulang" });
  }
}

// Wajib role ADMIN (dipakai setelah requireAuth)
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Akses ditolak" });
  }
  next();
}