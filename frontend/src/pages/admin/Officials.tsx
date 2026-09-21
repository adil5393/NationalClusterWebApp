import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  ShieldCheck,
  Search,
  IdCard,
  ImageOff,
  Camera,
  Printer,
  FileArchive,
  Phone,
  Mail,
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

interface Official {
  id: number;
  full_name: string;
  designation?: string;
  organization?: string;
  official_id_no?: string;
  gender?: string;
  phone?: string;
  email?: string;
  notes?: string;
  photo_url?: string | null;
}

const empty: Partial<Official> = { full_name: "" };

export default function Officials() {
  const { canEdit } = useModuleAccess("officials");
  const [officials, setOfficials] = useState<Official[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [downloadAllOpen, setDownloadAllOpen] = useState(false);
  const [form, setForm] = useState<Partial<Official>>(empty);

  const load = () => {
    setLoading(true);
    api
      .get<Official[]>("/officials")
      .then((r) => setOfficials(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return officials;
    return officials.filter(
      (v) =>
        v.full_name.toLowerCase().includes(s) ||
        (v.designation || "").toLowerCase().includes(s) ||
        (v.organization || "").toLowerCase().includes(s) ||
        (v.official_id_no || "").toLowerCase().includes(s) ||
        (v.phone || "").toLowerCase().includes(s) ||
        (v.email || "").toLowerCase().includes(s),
    );
  }, [officials, search]);

  const withPhotoCount = officials.filter((v) => v.photo_url).length;

  const save = async () => {
    if (!form.full_name?.trim()) return toast.error("Full name is required");
    try {
      if (form.id) await api.put(`/officials/${form.id}`, form);
      else await api.post("/officials", form);
      toast.success(form.id ? "Official updated" : "Official created");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save official");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this official?")) return;
    try {
      await api.delete(`/officials/${id}`);
      toast.success("Official deleted");
      load();
    } catch {
      toast.error("Could not delete official");
    }
  };

  const uploadPhoto = async (v: Official, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post<Official>(`/officials/${v.id}/photo`, fd, {
        headers: { "Content-Type": undefined } as any,
      });
      setOfficials((rows) => rows.map((row) => (row.id === v.id ? r.data : row)));
      toast.success("Photo uploaded");
    } catch {
      toast.error("Could not upload photo");
    }
  };

  const removePhoto = async (v: Official) => {
    if (!confirm(`Remove ${v.full_name}'s photo?`)) return;
    try {
      await api.delete(`/officials/${v.id}/photo`);
      setOfficials((rows) => rows.map((row) => (row.id === v.id ? { ...row, photo_url: null } : row)));
      toast.success("Photo removed");
    } catch {
      toast.error("Could not remove photo");
    }
  };

  return (
    <div data-testid="admin-officials" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            EVENT VOLUNTEER ROSTER
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Officials
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            {officials.length} registered officials ·{" "}
            <span className="font-bold text-emerald-400 font-mono">{withPhotoCount} photos uploaded</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              data-testid="import-officials-btn"
              className="text-xs font-semibold"
            >
              <Upload className="h-3.5 w-3.5 text-gold" /> Import Excel/CSV
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDownloadAllOpen(true)}
            data-testid="download-all-officials-btn"
            className="text-xs font-semibold"
            disabled={officials.length === 0}
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
              data-testid="add-official-btn"
              className="text-xs font-extrabold"
            >
              <Plus className="h-4 w-4" /> Add Official
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
          placeholder="Search by name, designation, organization, ID no., phone, or email…"
          className="pl-9"
          data-testid="official-search-input"
        />
      </div>

      {loading ? (
        <Spinner label="Loading officials…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No officials found"
          hint={officials.length === 0 ? "Add a official or import a spreadsheet to get started." : "No officials match your search."}
          action={
            canEdit &&
            officials.length === 0 && (
              <Button variant="gold" size="sm" onClick={() => { setForm(empty); setOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Official
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* MOBILE: CARD LIST */}
          <div className="grid gap-2.5 sm:gap-3 lg:hidden">
            {filtered.map((v, i) => (
              <div
                key={v.id}
                data-testid={`official-card-${v.id}`}
                className="rounded-xl border border-white/10 bg-obsidian-900/90 p-3.5 space-y-2.5 shadow-sm"
              >
                {/* ROW 1: IDENTITY & AVATAR */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      {v.photo_url ? (
                        <img
                          src={`${BASE_URL}${v.photo_url}`}
                          alt={v.full_name}
                          className="h-11 w-11 rounded-full object-cover border border-white/10"
                        />
                      ) : (
                        <div className="h-11 w-11 rounded-full bg-white/5 border border-white/10 grid place-items-center text-slate-400 font-heading font-black text-xs">
                          <ShieldCheck className="h-5 w-5 text-gold" />
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 rounded bg-obsidian-950 border border-white/15 px-1 text-[9px] font-mono font-bold text-slate-400">
                        #{i + 1}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-heading font-bold text-white text-sm truncate">{v.full_name}</h3>
                      {v.designation && (
                        <p className="text-xs text-gold font-body truncate">{v.designation}</p>
                      )}
                      {v.organization && (
                        <p className="text-[11px] text-slate-400 font-body truncate">{v.organization}</p>
                      )}
                    </div>
                  </div>

                  {/* OFFICIAL ID BADGE */}
                  {v.official_id_no && (
                    <div className="shrink-0">
                      <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 font-mono text-xs font-bold text-slate-300">
                        {v.official_id_no}
                      </span>
                    </div>
                  )}
                </div>

                {/* ROW 2: GENDER & CONTACT INFO */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-0.5">
                  {v.gender && (
                    <span className="rounded bg-white/5 px-1.5 py-0.2 text-slate-300 text-[11px]">
                      {v.gender}
                    </span>
                  )}
                  {v.phone && (
                    <a
                      href={`tel:${v.phone}`}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-gold font-mono text-[11px] transition-colors"
                    >
                      <Phone className="h-3 w-3 text-gold" />
                      {v.phone}
                    </a>
                  )}
                  {v.email && (
                    <a
                      href={`mailto:${v.email}`}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-gold font-mono text-[11px] transition-colors"
                    >
                      <Mail className="h-3 w-3 text-slate-500" />
                      {v.email}
                    </a>
                  )}
                </div>

                {v.notes && (
                  <p className="text-[11px] text-slate-400 italic font-body">
                    {v.notes}
                  </p>
                )}

                {/* ROW 3: MOBILE ACTION BUTTONS */}
                <div className="border-t border-white/10 pt-2 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {canEdit && (
                      <label
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold h-8 px-2.5 cursor-pointer transition-colors"
                        title="Upload Photo"
                        data-testid={`upload-photo-mobile-${v.id}`}
                      >
                        <Camera className="h-3.5 w-3.5 text-slate-300" />
                        <span>Photo</span>
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
                      href={`${BASE_URL}/api/officials/${v.id}/idcard.pdf`}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-md border text-xs font-semibold h-8 px-2.5 transition-colors",
                        v.photo_url
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20",
                      )}
                      data-testid={`download-idcard-mobile-${v.id}`}
                      title={v.photo_url ? "Download ID Card (PDF)" : "Download ID Card (Photo missing)"}
                    >
                      <IdCard className="h-3.5 w-3.5" />
                      <span>ID Card</span>
                    </a>

                    {canEdit && v.photo_url && (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="h-8 w-8"
                        onClick={() => removePhoto(v)}
                        data-testid={`remove-photo-mobile-${v.id}`}
                        title="Remove Photo"
                      >
                        <ImageOff className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="h-8 w-8"
                        onClick={() => {
                          setForm(v);
                          setOpen(true);
                        }}
                        data-testid={`edit-official-mobile-${v.id}`}
                        title="Edit Official"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-300" />
                      </Button>
                      <Button
                        variant="danger"
                        size="icon-sm"
                        className="h-8 w-8"
                        onClick={() => remove(v.id)}
                        data-testid={`delete-official-mobile-${v.id}`}
                        title="Delete Official"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP: TABLE */}
          <div className="hidden lg:block">
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Photo</TH>
                  <TH>Full Name</TH>
                  <TH>Designation</TH>
                  <TH>Organization</TH>
                  <TH>Official ID No.</TH>
                  <TH>Gender</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((v, i) => (
                  <TR key={v.id} data-testid={`official-row-${v.id}`}>
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
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                      )}
                    </TD>
                    <TD className="font-bold text-white text-sm">{v.full_name}</TD>
                    <TD className="text-slate-300 font-body text-xs">{v.designation || "—"}</TD>
                    <TD className="text-slate-300 font-body text-xs">{v.organization || "—"}</TD>
                    <TD className="font-mono text-xs text-slate-400">{v.official_id_no || "—"}</TD>
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
                          href={`${BASE_URL}/api/officials/${v.id}/idcard.pdf`}
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
                            data-testid={`edit-official-${v.id}`}
                            title="Edit Official"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-300" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => remove(v.id)}
                            data-testid={`delete-official-${v.id}`}
                            title="Delete Official"
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
          </div>
        </>
      )}

      {/* ADD / EDIT DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Official" : "Add Official"}
        testId="official-dialog"
      >
        <div className="space-y-4">
          <div>
            <Label>Full Name *</Label>
            <Input
              value={form.full_name || ""}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              data-testid="official-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Designation</Label>
              <Input
                value={form.designation || ""}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                data-testid="official-designation-input"
              />
            </div>
            <div>
              <Label>Organization</Label>
              <Input
                value={form.organization || ""}
                onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                data-testid="official-organization-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Official ID No.</Label>
              <Input
                value={form.official_id_no || ""}
                onChange={(e) => setForm((f) => ({ ...f, official_id_no: e.target.value }))}
                data-testid="official-id-no-input"
              />
            </div>
            <div>
              <Label>Gender</Label>
              <Select
                value={form.gender || ""}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                data-testid="official-gender-select"
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
              <Label>Mobile No.</Label>
              <Input
                value={form.phone || ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                data-testid="official-phone-input"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                data-testid="official-email-input"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              data-testid="official-notes-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-official-btn">
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="officials" onDone={load} />

      {/* DOWNLOAD ALL ID CARDS DIALOG */}
      <Dialog
        open={downloadAllOpen}
        onClose={() => setDownloadAllOpen(false)}
        title="Download All Official ID Cards"
        testId="official-idcard-download-dialog"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-body">
            Choose how to download every official's card, sorted by name.
          </p>
          <a
            href={`${BASE_URL}/api/officials/idcards/all.pdf`}
            onClick={() => setDownloadAllOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="official-idcard-download-a4"
          >
            <IdCard className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">A4 Sheet</p>
              <p className="text-xs text-slate-400">4 cards per page — standard printer paper</p>
            </div>
          </a>
          <a
            href={`${BASE_URL}/api/officials/idcards/all/sheet-12x18.pdf`}
            onClick={() => setDownloadAllOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="official-idcard-download-12x18"
          >
            <Printer className="h-5 w-5 text-gold shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-heading font-bold text-white">12x18in Sheet</p>
              <p className="text-xs text-slate-400">9 cards per page — for print-shop stock</p>
            </div>
          </a>
          <a
            href={`${BASE_URL}/api/officials/idcards/all/individual.zip`}
            onClick={() => setDownloadAllOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3.5 hover:border-gold/40 hover:bg-white/[0.06] transition-colors"
            data-testid="official-idcard-download-individual"
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
