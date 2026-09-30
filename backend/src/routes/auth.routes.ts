import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.email("Format email tidak valid"),
  password: z.string({ error: "Password wajib diisi" }).min(1, "Password wajib diisi"),
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      message: "Data tidak valid",
      errors: z.flattenError(parsed.error).fieldErrors,
    });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Pesan sengaja disamakan agar tidak bocor email mana yang terdaftar
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Email atau password salah" });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: "1d",
  });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// GET /api/auth/me  -> data user yang sedang login
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    return res.status(401).json({ message: "User tidak ditemukan" });
  }

  res.json(user);
});

export default router;