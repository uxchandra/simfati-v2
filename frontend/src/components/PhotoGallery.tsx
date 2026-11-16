import { useRef, useState } from "react";
import { Camera, ImageOff, Loader2, X } from "lucide-react";
import { api, ApiError, fileUrl } from "../lib/api";
import { compressImage } from "../lib/checkup";
import type { CheckupPhoto } from "../types";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  photos: CheckupPhoto[];
  // Endpoint upload & hapus, mis. "/repair-requests/3/photos" (hapus = `${endpoint}/${id}`)
  endpoint: string;
  editable: boolean;
  max?: number;
  onChange: (photos: CheckupPhoto[]) => void;
  onError: (message: string) => void;
};

// Galeri foto dokumentasi: ambil dari kamera HP / pilih file, diperkecil dulu sebelum diupload
export default function PhotoGallery({ title, photos, endpoint, editable, max = 10, onChange, onError }: Props) {
  const [uploading, setUploading] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = max - photos.length;
    const selected = [...files].slice(0, room);
    if (files.length > room) onError(`Maksimal ${max} foto`);

    let current = photos;
    setUploading((n) => n + selected.length);
    for (const file of selected) {
      try {
        const blob = await compressImage(file);
        const photo = await api<CheckupPhoto>(endpoint, {
          method: "POST",
          body: blob,
          headers: { "Content-Type": blob.type || file.type },
        });
        current = [...current, photo];
        onChange(current);
      } catch (err) {
        onError(err instanceof ApiError ? err.message : "Gagal mengupload foto");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleDelete(photo: CheckupPhoto) {
    try {
      await api(`${endpoint}/${photo.id}`, { method: "DELETE" });
      onChange(photos.filter((p) => p.id !== photo.id));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal menghapus foto");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          {title}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({photos.length}/{max})
          </span>
        </h2>
        {editable && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading > 0 || photos.length >= max}
              onClick={() => fileInput.current?.click()}
            >
              {uploading > 0 ? <Loader2 className="animate-spin" /> : <Camera />}
              {uploading > 0 ? `Mengupload ${uploading}...` : "Ambil / Pilih Foto"}
            </Button>
          </>
        )}
      </div>
      {photos.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-6 text-sm text-muted-foreground">
          <ImageOff className="size-6 opacity-50" />
          Belum ada foto
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              <a href={fileUrl(photo.path)} target="_blank" rel="noreferrer">
                <img src={fileUrl(photo.path)} alt="Foto" loading="lazy" className="size-full object-cover" />
              </a>
              {editable && (
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-destructive"
                  title="Hapus foto"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
