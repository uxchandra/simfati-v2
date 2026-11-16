import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Folder file upload: backend/uploads (tidak ikut git). Disajikan di /uploads oleh index.ts
export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");

// Path di dalam UPLOAD_DIR -> path absolut, menolak path yang keluar dari folder uploads
export function uploadPath(relative: string) {
  const full = path.resolve(UPLOAD_DIR, relative);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Path upload tidak valid");
  return full;
}

// ===== Foto (checkup, repair request) =====

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
export const PHOTO_MIME_TYPES = Object.keys(PHOTO_TYPES);

// Cek isi file benar-benar gambar (bukan hanya dari Content-Type)
function looksLikeImage(buf: Buffer, type: string) {
  if (type === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (type === "image/png") return buf.subarray(0, 4).toString("hex") === "89504e47";
  if (type === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return false;
}

// Simpan body gambar mentah ke uploads/<dir>/. Mengembalikan path relatif, atau null kalau bukan gambar valid.
export async function savePhoto(dir: string, body: unknown, contentType: string | undefined) {
  const type = String(contentType ?? "").split(";")[0];
  const ext = PHOTO_TYPES[type];
  if (!ext || !Buffer.isBuffer(body) || !looksLikeImage(body, type)) return null;

  const relative = `${dir}/${randomUUID()}${ext}`;
  await fs.mkdir(path.join(UPLOAD_DIR, dir), { recursive: true });
  await fs.writeFile(uploadPath(relative), body);
  return relative;
}

// Hapus file upload; file yang sudah tidak ada / gagal dihapus diabaikan
export async function removeUploads(paths: string[]) {
  await Promise.all(paths.map((p) => fs.rm(uploadPath(p), { force: true }).catch(() => {})));
}
