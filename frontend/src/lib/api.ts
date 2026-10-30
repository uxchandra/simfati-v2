import type { FieldErrors } from "../types";

const API_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = "token";

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Error khusus supaya komponen bisa membaca status & error per field
export class ApiError extends Error {
  status: number;
  errors: FieldErrors;

  constructor(message: string, status: number, errors: FieldErrors = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// Pembungkus fetch: otomatis kirim token & ubah respon gagal jadi ApiError
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Token kadaluarsa / tidak valid -> hapus token & kembali ke login
    if (res.status === 401 && token) {
      tokenStorage.clear();
      window.location.href = "/login";
    }
    throw new ApiError(body.message ?? "Terjadi kesalahan", res.status, body.errors);
  }

  return body as T;
}

// Download file (mis. template Excel) dari endpoint yang butuh token
export async function apiDownload(path: string, filename: string) {
  const token = tokenStorage.get();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError("Gagal mengunduh file", res.status);

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Upload file mentah (application/octet-stream), respon tetap JSON
export function apiUpload<T>(path: string, file: File) {
  return api<T>(path, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
}
