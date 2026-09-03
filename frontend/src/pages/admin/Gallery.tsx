import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { UploadCloud, Trash2, Camera as CameraIcon, Images } from "lucide-react";
import { toast } from "sonner";
import { api, assetUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";

interface Photo {
  id: number;
  filename: string;
  url: string;
  tag: string;
}

const SUGGESTED_TAGS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Opening Ceremony", "Finals", "General"];

// "Day 2" before "Day 10" — plain string sort would get that backwards.
function naturalCompare(a: string, b: string): number {
  const parts = (s: string) => s.match(/\d+|\D+/g) ?? [s];
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "";
    const y = pb[i] ?? "";
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== "" && y !== "") {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export default function AdminGallery() {
  const { canEdit } = useModuleAccess("gallery");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [uploadTag, setUploadTag] = useState("Day 1");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api
      .get<Photo[]>("/gallery/photos")
      .then((r) => setPhotos(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const existingTags = useMemo(
    () => Array.from(new Set([...SUGGESTED_TAGS, ...photos.map((p) => p.tag)])).sort(naturalCompare),
    [photos],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of photos) {
      if (!map.has(p.tag)) map.set(p.tag, []);
      map.get(p.tag)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => naturalCompare(a[0], b[0]));
  }, [photos]);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      fd.append("tag", uploadTag.trim() || "General");
      const r = await api.post<{ uploaded: Photo[]; errors: string[] }>("/gallery/photos", fd, {
        headers: { "Content-Type": undefined } as any,
      });
      if (r.data.uploaded.length > 0) {
        setPhotos((prev) => [...prev, ...r.data.uploaded]);
        toast.success(`${r.data.uploaded.length} photo${r.data.uploaded.length === 1 ? "" : "s"} uploaded to "${uploadTag}"`);
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

  const retag = async (photo: Photo, tag: string) => {
    if (tag === photo.tag) return;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, tag } : p)));
    try {
      await api.put(`/gallery/photos/${photo.id}`, { tag });
    } catch (e: any) {
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, tag: photo.tag } : p)));
      toast.error(e?.response?.data?.detail ?? "Could not re-tag photo");
    }
  };

  const remove = async (photo: Photo) => {
    if (!confirm("Delete this photo from the gallery?")) return;
    setDeletingId(photo.id);
    try {
      await api.delete(`/gallery/photos/${photo.id}`);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      toast.success("Photo deleted");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not delete photo");
    } finally {
      setDeletingId(null);
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
            Shown on the public homepage's rotating card and album, grouped by the tag below. Bulk-upload from a
            computer, or use "Take Photo" (on a phone, opens the camera directly) to add shots straight from the
            courtside.
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Tag new uploads as</Label>
            <Input
              list="gallery-tag-suggestions"
              value={uploadTag}
              onChange={(e) => setUploadTag(e.target.value)}
              className="h-9 w-40 text-sm"
              data-testid="gallery-tag-input"
            />
            <datalist id="gallery-tag-suggestions">
              {existingTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
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
          <span className="text-[11px] text-slate-500 font-body self-center">JPG, PNG, or WEBP.</span>
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
        <div className="space-y-6" data-testid="gallery-groups">
          {groups.map(([tag, groupPhotos]) => (
            <div key={tag} className="space-y-2.5">
              <h3 className="text-xs font-heading font-extrabold uppercase tracking-wider text-gold">
                {tag} <span className="text-slate-500 font-mono normal-case">({groupPhotos.length})</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {groupPhotos.map((p) => (
                  <div
                    key={p.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-obsidian-950"
                    data-testid={`gallery-photo-${p.id}`}
                  >
                    <img src={assetUrl(p.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    {canEdit && (
                      <>
                        <button
                          onClick={() => remove(p)}
                          disabled={deletingId === p.id}
                          className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/80"
                          data-testid={`delete-photo-${p.id}`}
                          title="Delete photo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <Select
                          value={p.tag}
                          onChange={(e) => retag(p, e.target.value)}
                          className="absolute bottom-1.5 left-1.5 right-1.5 h-7 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                          data-testid={`retag-photo-${p.id}`}
                        >
                          {existingTags.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}
                  </div>
                ))}
              </div>
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
