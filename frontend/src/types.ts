export type Role = "ADMIN" | "USER";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

// Format error validasi dari backend: { email: ["Email sudah dipakai"] }
export type FieldErrors = Record<string, string[] | undefined>;
export type KategoriAset = {
  id: number;
  name: string;
  createdAt?: string;
};

export type SubcontStatus = "active" | "inactive";

export type Subcont = {
  id: number;
  nama: string;
  alamat: string | null;
  noTelp: string | null;
  pic: string | null;
  status: SubcontStatus;
  createdAt?: string | null;
};

// Dipakai bersama oleh Kategori Schedule & Kategori Repair
export type Category = {
  id: number;
  name: string;
  createdAt?: string | null;
};

export type AssetStatus = "active" | "inactive";

// Kolom teks opsional asset (semua boleh null)
export type AssetTextField =
  | "description"
  | "lane"
  | "kapasitas"
  | "model"
  | "tahunPembuatan"
  | "nomorSeri"
  | "power"
  | "tglInstal"
  | "keterangan"
  | "capacityKn"
  | "slideStroke"
  | "strokePerMinute"
  | "dieHeight"
  | "slideAdjustment"
  | "slideArea"
  | "bolsterArea"
  | "mainMotor"
  | "reqAirPressure"
  | "maxUpperDieWeight"
  | "powerSource"
  | "brakingTime";

export type Asset = {
  id: number;
  categoryId: number;
  category: Pick<KategoriAset, "id" | "name">;
  status: AssetStatus;
  kode: string;
  checksheetId?: number | null;
  checksheet?: { id: number; name: string } | null;
  createdAt?: string | null;
} & Record<AssetTextField, string | null>;

// Mesin ringkas yang ditampilkan di PIC Mesin
export type PicAsset = Pick<Asset, "id" | "kode" | "model" | "category">;

// Satu baris PIC Mesin = satu user beserta semua mesinnya
export type PicMesin = {
  user: Pick<User, "id" | "name" | "email">;
  assets: PicAsset[];
};

export type Checksheet = {
  id: number;
  name: string;
  category: Pick<KategoriAset, "id" | "name">;
  itemCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ChecksheetItem = {
  id: number;
  urutan: number;
  bagian: string;
  poin: string;
  metode: string | null;
  standar: string | null;
};

export type ChecksheetDetail = Checksheet & { items: ChecksheetItem[] };

// Hasil baca satu sheet Excel sebelum disimpan
export type ChecksheetImportSheet = {
  sheet: string;
  kategori: string;
  name: string;
  items: (Omit<ChecksheetItem, "id" | "urutan"> & { baris: number })[];
  errors: string[];
  categoryId: number | null;
  // Diisi kalau checksheet dengan nama sama sudah ada (isinya akan diganti)
  existing: { id: number; itemCount: number } | null;
};

export type ChecksheetImportPreview = {
  sheets: ChecksheetImportSheet[];
  valid: boolean;
};

export type Sparepart = {
  id: number;
  kodeBarang: string;
  namaBarang: string | null;
  spec: string | null;
  stok: number | null;
  minimalStok: number | null;
  maksimalStok: number | null;
  uom: string | null;
  keterangan: string | null;
  createdAt?: string | null;
};

// habis: stok kosong/0 · low: stok ≤ minimal stok · aman: selain itu
export type StockStatus = "aman" | "low" | "habis";

export type SparepartStats = { total: number } & Record<StockStatus, number>;

export type SparepartImportRow = Omit<Sparepart, "id" | "createdAt"> & {
  baris: number;
  errors: string[];
  existingId: number | null;
};

export type SparepartImportPreview = {
  rows: SparepartImportRow[];
  summary: { total: number; baru: number; update: number; invalid: number };
  valid: boolean;
};

export type AssetImportRow = Omit<Asset, "id" | "categoryId" | "category" | "createdAt"> & {
  baris: number;
  errors: string[];
  existingId: number | null;
};

export type AssetImportPreview = {
  rows: AssetImportRow[];
  summary: { total: number; baru: number; update: number; invalid: number };
  valid: boolean;
};

// ===== Jadwal preventive =====

export type PreventiveType = "periodic" | "yearly";
export type ScheduleStatus = "planned" | "in_progress" | "done";

// Satu bulatan di tabel jadwal: minggu ke-N (1..4) pada bulan tertentu
export type PreventiveSchedule = {
  id: number;
  bulan: number;
  minggu: number;
  tipe: PreventiveType;
  status: ScheduleStatus;
  startedAt: string | null;
  completedAt: string | null;
};

// Satu baris tabel jadwal (mesin / aktivitas)
export type PreventivePlan = {
  id: number;
  urutan: number;
  grup: string | null;
  nama: string;
  deskripsi: string | null;
  asset: { id: number; kode: string; checksheet: { id: number; name: string } | null } | null;
  schedules: PreventiveSchedule[];
};

export type PreventiveScheduleTable = {
  category: Pick<KategoriAset, "id" | "name">;
  tahun: number;
  plans: PreventivePlan[];
};

export type ScheduleImportRow = {
  baris: number;
  no: string;
  grup: string | null;
  nama: string;
  deskripsi: string | null;
  schedules: Pick<PreventiveSchedule, "bulan" | "minggu" | "tipe">[];
  asset: { id: number; kode: string } | null;
};

export type ScheduleImportPreview = {
  sheet: string;
  tahun: number | null;
  rows: ScheduleImportRow[];
  warnings: string[];
  errors: string[];
  existing: { plans: number; schedules: number; progress: number };
  summary: { rows: number; schedules: number; matched: number; unmatched: number };
  valid: boolean;
};
