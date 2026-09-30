import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Izinkan frontend (Vite, port 5173) mengakses API ini
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

app.get("/api", (_req, res) => {
  res.json({ message: "API jalan 🚀" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Route tidak ditemukan
app.use((_req, res) => {
  res.status(404).json({ message: "Endpoint tidak ditemukan" });
});

// Penangkap error global (Express 5 otomatis meneruskan error dari async handler ke sini)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server" });
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});