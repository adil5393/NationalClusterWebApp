import { useEffect, useRef, useState } from "react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { UploadCloud, Trash2, Camera as CameraIcon, Images } from "lucide-react";
import { toast } from "sonner";
import { api, assetUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";

interface Photo {
  filename: string;
  url: string;
}

export default function AdminGallery() {
  const { canEdit } = useModuleAccess("gallery");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api
      .get<Photo[]>("/gallery/photos")
      .then((r) => setPhotos(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const r = await api.post<{ uploaded: Photo[]; errors: string[] }>("/gallery/photos", fd, {
        headers: { "Content-Type": undefined } as any,
      });
      if (r.data.uploaded.length > 0) {
        setPhotos((prev) => [...prev, ...r.data.uploaded]);
        toast.success(`${r.data.uploaded.length} photo${r.data.uploaded.length === 1 ? "" : "s"} uploaded`);
      }
      for (const err of r.data.errors) toast.error(err);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) later
    uploadFiles(files);
  };

  const takePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 85,
      });
      if (!photo.webPath) return;
      const blob = await (await fetch(photo.webPath)).blob();
      const ext = photo.format ? `.${photo.format}` : ".jpg";
      const file = new File([blob], `camera-${Date.now()}${ext}`, { type: blob.type || "image/jpeg" });
      await uploadFiles([file]);
    } catch (e: any) {
      // User cancelling the camera also lands here — Capacitor rejects with
      // a generic "User cancelled photos app" message, not worth surfacing.
      if (String(e?.message ?? "").toLowerCase().includes("cancel")) return;
      toast.error("Could not capture photo");
    }
  };

  const remove = async (filename: string) => {
    if (!confirm("Delete this photo from the gallery?")) return;
    setDeletingFile(filename);
    try {
      await api.delete(`/gallery/photos/${encodeURIComponent(filename)}`);
      setPhotos((prev) => prev.filter((p) => p.filename !== filename));
      toast.success("Photo deleted");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete photo");
    } finally {
      setDeletingFile(null);
    }
  };

  return (
    <div data-testid="admin-gallery" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            PUBLIC SITE MEDIA
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Championship Photo Gallery
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Shown on the public About page. Bulk-upload from a computer, or use "Take Photo" (on a phone, opens the
            camera directly) to add shots straight from the courtside.
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={onPickFiles}
            data-testid="gallery-file-input"
          />
          <Button
            variant="gold"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs font-bold"
            data-testid="bulk-upload-btn"
          >
            <UploadCloud className="h-4 w-4" /> {uploading ? "Uploading…" : "Bulk Upload Photos"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={takePhoto}
            disabled={uploading}
            className="text-xs font-bold"
            data-testid="take-photo-btn"
          >
            <CameraIcon className="h-4 w-4 text-gold" /> Take Photo
          </Button>
          <span className="text-[11px] text-slate-500 font-body">JPG, PNG, or WEBP.</span>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
          <Spinner label="Loading gallery…" />
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState
            title="No photos yet"
            hint="Bulk-upload event photos here, or capture them on the go from the mobile app."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="gallery-grid">
          {photos.map((p) => (
            <div
              key={p.filename}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-obsidian-950"
              data-testid={`gallery-photo-${p.filename}`}
            >
              <img src={assetUrl(p.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
              {canEdit && (
                <button
                  onClick={() => remove(p.filename)}
                  disabled={deletingFile === p.filename}
                  className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/80"
                  data-testid={`delete-photo-${p.filename}`}
                  title="Delete photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && photos.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 font-body">
          <Images className="h-3.5 w-3.5" /> {photos.length} photo{photos.length === 1 ? "" : "s"} live on the
          public site
        </p>
      )}
    </div>
  );
}
