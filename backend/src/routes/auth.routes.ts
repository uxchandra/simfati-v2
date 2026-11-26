import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { userSelect } from "../lib/user-select";

const router = Router();

const loginSchema = z.object({
  username: z.string({ error: "Username wajib diisi" }).trim().min(1, "Username wajib diisi"),
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

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });

  // Pesan sengaja disamakan agar tidak bocor username mana yang terdaftar
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Username atau password salah" });
  }

  // Token cukup berisi id; role dibaca ulang dari database di requireAuth
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, { expiresIn: "1d" });

  res.json({
    token,
    user: await prisma.user.findUnique({ where: { id: user.id }, select: userSelect }),
  });
});

// GET /api/auth/me  -> data user yang sedang login
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: userSelect,
  });

  if (!user) {
    return res.status(401).json({ message: "User tidak ditemukan" });
  }

  res.json(user);
});

export default router;