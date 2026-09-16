import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  HeartHandshake,
  Search,
  IdCard,
  ImageOff,
  Camera,
  Printer,
  FileArchive,
} from "lucide-react";
import { toast } from "sonner";
import { api, BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { ImportDialog } from "@/components/admin/ImportDialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { useModuleAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface Volunteer {
  id: number;
  full_name: string;
  student_class?: string;
  gender?: string;
  phone?: string;
  email?: string;
  notes?: string;
  photo_url?: string | null;
}

const empty: Partial<Volunteer> = { full_name: "" };

export default function Volunteers() {
  const { canEdit } = useModuleAccess("volunteers");
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadAllOpen, setDownloadAllOpen] = useState(false);
  const [form, setForm] = useState<Partial<Volunteer>>(empty);

  const load = () => {
    setLoading(true);
    api
      .get<Volunteer[]>("/volunteers")
      .then((r) => setVolunteers(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return volunteers;
    return volunteers.filter(
      (v) =>
        v.full_name.toLowerCase().includes(s) ||
        (v.student_class || "").toLowerCase().includes(s) ||
        (v.phone || "").toLowerCase().includes(s) ||
        (v.email || "").toLowerCase().includes(s),
    );
  }, [volunteers, search]);

  const withPhotoCount = volunteers.filter((v) => v.photo_url).length;

  const save = async () => {
    if (!form.full_name?.trim()) return toast.error("Full name is required");
    try {
      if (form.id) await api.put(`/volunteers/${form.id}`, form);
      else await api.post("/volunteers", form);
      toast.success(form.id ? "Volunteer updated" : "Volunteer created");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save volunteer");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this volunteer?")) return;
    try {
      await api.delete(`/volunteers/${id}`);
      toast.success("Volunteer deleted");
      load();
    } catch {
      toast.error("Could not delete volunteer");
    }
  };

  const uploadPhoto = async (v: Volunteer, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post<Volunteer>(`/volunteers/${v.id}/photo`, fd, {
        headers: { "Content-Type": undefined } as any,
      });
      setVolunteers((rows) => rows.map((row) => (row.id === v.id ? r.data : row)));
      toast.success("Photo uploaded");
    } catch {
      toast.error("Could not upload photo");
    }
  };

  const removePhoto = async (v: Volunteer) => {
    if (!confirm(`Remove ${v.full_name}'s photo?`)) return;
    try {
      await api.delete(`/volunteers/${v.id}/photo`);
      setVolunteers((rows) => rows.map((row) => (row.id === v.id ? { ...row, photo_url: null } : row)));
      toast.success("Photo removed");
    } catch {
      toast.error("Could not remove photo");
    }
  };

  return (
    <div data-testid="admin-volunteers" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            EVENT VOLUNTEER ROSTER
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Volunteers
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {volunteers.length} registered volunteers ·{" "}
            <span className="font-bold text-emerald-400 font-mono">{withPhotoCount} photos uploaded</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              data-testid="import-volunteers-btn"
              className="text-xs font-semibold"
            >
              <Upload className="h-3.5 w-3.5 text-gold" /> Import Excel/CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDownloadAllOpen(true)}
            data-testid="download-all-volunteers-btn"
            className="text-xs font-semibold"
            disabled={volunteers.length === 0}
          >
            <Download className="h-3.5 w-3.5 text-gold" /> Download All ID Cards
          </Button>
          {canEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setForm(empty);
                setOpen(true);
              }}
              data-testid="add-volunteer-btn"
              className="text-xs font-extrabold"
            >
              <Plus className="h-4 w-4" /> Add Volunteer
            </Button>
          )}
        </div>
      </div>

      {/* SEARCH */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, class, phone, or email…"
          className="pl-9"
          data-testid="volunteer-search-input"
        />
      </div>

      {loading ? (
        <Spinner label="Loading volunteers…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title="No volunteers found"
          hint={volunteers.length === 0 ? "Add a volunteer or import a spreadsheet to get started." : "No volunteers match your search."}
          action={
            canEdit &&
            volunteers.length === 0 && (
              <Button variant="gold" size="sm" onClick={() => { setForm(empty); setOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Volunteer
              </Button>
            )
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Photo</TH>
              <TH>Full Name</TH>
              <TH>Class</TH>
              <TH>Gender</TH>
              <TH>Phone</TH>
              <TH>Email</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((v, i) => (
              <TR key={v.id} data-testid={`volunteer-row-${v.id}`}>
                <TD className="text-slate-500 font-mono text-xs">{i + 1}</TD>
                <TD>
                  {v.photo_url ? (
                    <img
                      src={`${BASE_URL}${v.photo_url}`}
                      alt={v.full_name}
                      className="h-9 w-9 rounded-full object-cover border border-white/10"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-white/5 border border-white/10 grid place-items-center text-slate-500">
                      <HeartHandshake className="h-4 w-4" />
                    </div>
                  )}
                </TD>
                <TD className="font-bold text-white text-sm">{v.full_name}</TD>
                <TD className="text-slate-300 font-body text-xs">{v.student_class || "—"}</TD>
                <TD className="text-slate-300 font-body text-xs">{v.gender || "—"}</TD>
                <TD className="font-mono text-xs text-slate-400">{v.phone || "—"}</TD>
                <TD className="font-mono text-xs text-slate-400">{v.email || "—"}</TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <label
                        className="inline-flex items-center justify-center gap-2 rounded-md font-body tracking-wide transition-colors h-8 w-8 p-0 cursor-pointer text-slate-300 hover:bg-white/10 hover:text-white"
                        title="Upload Photo"
                        data-testid={`upload-photo-${v.id}`}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadPhoto(v, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    <a
                      href={`${BASE_URL}/api/volunteers/${v.id}/idcard.pdf`}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-md font-body tracking-wide transition-colors h-8 w-8 p-0",
                        v.photo_url
                          ? "text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                          : "text-red-500 hover:bg-red-500/10 hover:text-red-400",
                      )}
                      data-testid={`download-idcard-${v.id}`}
                      title={v.photo_url ? "Download ID Card (PDF) — photo uploaded" : "Download ID Card (PDF) — photo not uploaded"}
                    >
                      <IdCard className="h-3.5 w-3.5" />
                    </a>
                    {canEdit && v.photo_url && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removePhoto(v)}
                        data-testid={`remove-photo-${v.id}`}
                        title="Remove Uploaded Photo"
                      >
                        <ImageOff className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setForm(v);
                          setOpen(true);
                        }}
                        data-testid={`edit-volunteer-${v.id}`}
                        title="Edit Volunteer"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-300" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(v.id)}
                        data-testid={`delete-volunteer-${v.id}`}
                        title="Delete Volunteer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* ADD / EDIT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Volunteer" : "Add Volunteer"}
        testId="volunteer-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Full Name *</Label>
            <Input
              value={form.full_name || ""}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              data-testid="volunteer-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Class</Label>
              <Input
                value={form.student_class || ""}
                onChange={(e) => setForm((f) => ({ ...f, student_class: e.target.value }))}
                data-testid="volunteer-class-input"
              />
            </div>
            <div>
              <Label>Gender</Label>
              <Select
                value={form.gender || ""}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                data-testid="volunteer-gender-select"
              >
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone || ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                data-testid="volunteer-phone-input"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                data-testid="volunteer-email-input"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              data-testid="volunteer-notes-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-volunteer-btn">
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="volunteers" onDone={load} />

      {/* DOWNLOAD ALL ID CARDS DIALOG */}
      <Dialog
        open={downloadAllOpen}
        onClose={() => setDownloadAllOpen(false)}
        title="Download All Volunteer ID Cards"
        testId="volunteer-idcard-download-dialog"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-body">
            Choose how to download every volunteer's card, sorted by name.
          </p>
          <a
            href={`${BASE_URL}/api/volunteers/idcards/all.pdf`}
            onClick={() => setDownloadAllOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="volunteer-idcard-download-a4"
          >
            <IdCard className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">A4 Sheet</p>
              <p className="text-xs text-slate-400">9 cards per page — standard printer paper</p>
            </div>
          </a>
          <a
            href={`${BASE_URL}/api/volunteers/idcards/all/sheet-12x18.pdf`}
            onClick={() => setDownloadAllOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="volunteer-idcard-download-12x18"
          >
            <Printer className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">12x18in Sheet</p>
              <p className="text-xs text-slate-400">16 cards per page — for print-shop stock</p>
            </div>
          </a>
          <a
            href={`${BASE_URL}/api/volunteers/idcards/all/individual.zip`}
            onClick={() => setDownloadAllOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="volunteer-idcard-download-individual"
          >
            <FileArchive className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">Individual Cards (ZIP)</p>
              <p className="text-xs text-slate-400">One PDF per card — for picking &amp; arranging in design/print layout software</p>
            </div>
          </a>
        </div>
      </Dialog>
    </div>
  );
}
