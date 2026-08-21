import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, QrCode, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { QRDialog } from "@/components/admin/QRDialog";
import { ImportDialog } from "@/components/admin/ImportDialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";

interface Team {
  id: number;
  name: string;
  school?: string;
  region?: string;
  country?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  member_count?: number;
  notes?: string;
}

const empty: Partial<Team> = { name: "", school: "", region: "", country: "India", member_count: 0 };

export default function AdminTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [qrTeam, setQrTeam] = useState<{ id: number; name: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<Partial<Team>>(empty);

  const load = () => {
    setLoading(true);
    api.get<Team[]>("/teams").then((r) => setTeams(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Team name is required");
    try {
      const payload = { ...form, member_count: Number(form.member_count) || 0 };
      if (form.id) await api.put(`/teams/${form.id}`, payload);
      else await api.post("/teams", payload);
      toast.success(form.id ? "Team updated" : "Team created");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save team");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this team?")) return;
    await api.delete(`/teams/${id}`);
    toast.success("Team deleted");
    load();
  };

  const set = (k: keyof Team, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-teams">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-black tracking-tight text-slate-950">Teams</h1>
          <p className="mt-1 text-sm text-slate-500">{teams.length} teams registered</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="import-teams-btn"><Upload className="h-4 w-4" /> Import</Button>
          <Button onClick={() => { setForm(empty); setOpen(true); }} data-testid="add-team-btn">
            <Plus className="h-4 w-4" /> Add Team
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <Spinner />
        ) : teams.length === 0 ? (
          <div className="p-6"><EmptyState title="No teams yet" hint="Add your first team to get started." /></div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Team</TH>
                <TH>Region</TH>
                <TH>Country</TH>
                <TH className="text-right">Members</TH>
                <TH>Contact</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {teams.map((t) => (
                <TR key={t.id} data-testid={`team-row-${t.id}`}>
                  <TD className="font-bold text-slate-900">{t.name}<div className="text-xs font-normal text-slate-500">{t.school}</div></TD>
                  <TD>{t.region || "—"}</TD>
                  <TD><Badge tone={t.country === "India" ? "coral" : "blue"}>{t.country}</Badge></TD>
                  <TD className="text-right font-semibold">{t.member_count ?? 0}</TD>
                  <TD className="text-slate-600">{t.contact_name || "—"}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setQrTeam({ id: t.id, name: t.name })} data-testid={`qr-team-${t.id}`}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setForm(t); setOpen(true); }} data-testid={`edit-team-${t.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(t.id)} data-testid={`delete-team-${t.id}`}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={form.id ? "Edit Team" : "Add Team"} testId="team-dialog">
        <div className="space-y-4">
          <div><Label>Team Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} data-testid="team-name-input" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>School</Label><Input value={form.school ?? ""} onChange={(e) => set("school", e.target.value)} /></div>
            <div><Label>Region / State</Label><Input value={form.region ?? ""} onChange={(e) => set("region", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Country</Label><Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} /></div>
            <div><Label>Members</Label><Input type="number" value={form.member_count ?? 0} onChange={(e) => set("member_count", e.target.value)} data-testid="team-members-input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Contact Name</Label><Input value={form.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></div>
            <div><Label>Contact Phone</Label><Input value={form.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} data-testid="save-team-btn">Save Team</Button>
          </div>
        </div>
      </Dialog>

      <QRDialog
        open={qrTeam !== null}
        onClose={() => setQrTeam(null)}
        url={qrTeam ? `${window.location.origin}/teams/${qrTeam.id}` : ""}
        title={qrTeam?.name ?? ""}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} type="teams" onDone={load} />
    </div>
  );
}
