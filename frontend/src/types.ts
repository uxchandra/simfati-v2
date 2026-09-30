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