import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import kategoriAsetRoutes from "./routes/kategori-aset.routes";
import subcontRoutes from "./routes/subcont.routes";
import scheduleCategoryRoutes from "./routes/schedule-category.routes";
import repairCategoryRoutes from "./routes/repair-category.routes";
import assetRoutes from "./routes/asset.routes";
import picMesinRoutes from "./routes/pic-mesin.routes";
import sparepartRoutes from "./routes/sparepart.routes";
import checksheetRoutes from "./routes/checksheet.routes";
import preventiveScheduleRoutes from "./routes/preventive-schedule.routes";

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
app.use("/api/kategori-aset", kategoriAsetRoutes);
app.use("/api/subcont", subcontRoutes);
app.use("/api/schedule-categories", scheduleCategoryRoutes);
app.use("/api/repair-categories", repairCategoryRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/pic-mesin", picMesinRoutes);
app.use("/api/checksheets", checksheetRoutes);
app.use("/api/spareparts", sparepartRoutes);
app.use("/api/preventive-schedules", preventiveScheduleRoutes);

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