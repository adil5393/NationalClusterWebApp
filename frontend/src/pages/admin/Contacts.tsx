import { useState, useEffect, useMemo } from "react";
import {
  Phone,
  Mail,
  Plus,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  Shield,
  Zap,
  Globe,
  Lock,
  User,
  Building,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface OperationalCategory {
  id: number;
  name: string;
  key: string;
  icon?: string;
  display_order: number;
}

interface StaffMemberOption {
  id: number;
  full_name: string;
  designation?: string;
  phone?: string;
  email?: string;
  category?: string;
  languages?: string[];
}

interface ContactPersonDTO {
  id?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  role?: string | null;
  languages?: string[];
  is_staff: boolean;
  is_on_duty: boolean;
  is_external: boolean;
}

interface ContactTopic {
  id: number;
  title: string;
  description?: string;
  category_name?: string;
  icon?: string;
  display_order: number;
  is_active: boolean;
  is_public: boolean;
  // Primary Contact
  primary_type: "staff" | "external";
  primary_staff_id?: number | null;
  primary_name?: string | null;
  primary_phone?: string | null;
  primary_email?: string | null;
  primary_role?: string | null;
  // Secondary Contact
  secondary_type: "none" | "staff" | "external";
  secondary_staff_id?: number | null;
  secondary_name?: string | null;
  secondary_phone?: string | null;
  secondary_email?: string | null;
  secondary_role?: string | null;
  // Shift incharge dynamic routing
  use_shift_incharge: boolean;
  operational_category_id?: number | null;
  operational_category_name?: string | null;
  // Resolved contacts
  primary_contact?: ContactPersonDTO | null;
  secondary_contact?: ContactPersonDTO | null;
  current_incharge?: ContactPersonDTO | null;
}

interface FormState {
  title: string;
  description: string;
  category_name: string;
  primary_type: "staff" | "external";
  primary_staff_id: string;
  primary_name: string;
  primary_phone: string;
  primary_email: string;
  primary_role: string;
  secondary_type: "none" | "staff" | "external";
  secondary_staff_id: string;
  secondary_name: string;
  secondary_phone: string;
  secondary_email: string;
  secondary_role: string;
  use_shift_incharge: boolean;
  operational_category_id: string;
  is_public: boolean;
  display_order: number;
}

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  category_name: "",
  primary_type: "staff",
  primary_staff_id: "",
  primary_name: "",
  primary_phone: "",
  primary_email: "",
  primary_role: "",
  secondary_type: "none",
  secondary_staff_id: "",
  secondary_name: "",
  secondary_phone: "",
  secondary_email: "",
  secondary_role: "",
  use_shift_incharge: false,
  operational_category_id: "",
  is_public: true,
  display_order: 0,
};

export function Contacts() {
  const [topics, setTopics] = useState<ContactTopic[]>([]);
  const [categories, setCategories] = useState<OperationalCategory[]>([]);
  const [staffList, setStaffList] = useState<StaffMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<ContactTopic | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      const [topicsRes, catsRes, staffRes] = await Promise.all([
        api.get<ContactTopic[]>("/contacts"),
        api.get<OperationalCategory[]>("/operational-categories"),
        api.get<StaffMemberOption[]>("/staff"),
      ]);
      setTopics(topicsRes.data || []);
      setCategories(catsRes.data || []);
      setStaffList(staffRes.data || []);
    } catch (err) {
      console.error("Failed to load contacts data:", err);
      toast.error("Failed to load contacts data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered topics
  const filteredTopics = useMemo(() => {
    return topics.filter((t) => {
      const matchesSearch =
        !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.primary_contact && t.primary_contact.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.secondary_contact && t.secondary_contact.name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat =
        selectedCategory === "all" ||
        (t.category_name && t.category_name.toLowerCase() === selectedCategory.toLowerCase()) ||
        (t.operational_category_name && t.operational_category_name.toLowerCase() === selectedCategory.toLowerCase());

      return matchesSearch && matchesCat;
    });
  }, [topics, searchQuery, selectedCategory]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingTopic(null);
    setForm({
      ...DEFAULT_FORM,
      display_order: topics.length * 10,
    });
    setModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (topic: ContactTopic) => {
    setEditingTopic(topic);
    setForm({
      title: topic.title,
      description: topic.description || "",
      category_name: topic.category_name || topic.operational_category_name || "",
      primary_type: topic.primary_type || (topic.primary_staff_id ? "staff" : "external"),
      primary_staff_id: topic.primary_staff_id ? String(topic.primary_staff_id) : "",
      primary_name: topic.primary_name || "",
      primary_phone: topic.primary_phone || "",
      primary_email: topic.primary_email || "",
      primary_role: topic.primary_role || "",
      secondary_type: topic.secondary_type || (topic.secondary_staff_id ? "staff" : topic.secondary_name ? "external" : "none"),
      secondary_staff_id: topic.secondary_staff_id ? String(topic.secondary_staff_id) : "",
      secondary_name: topic.secondary_name || "",
      secondary_phone: topic.secondary_phone || "",
      secondary_email: topic.secondary_email || "",
      secondary_role: topic.secondary_role || "",
      use_shift_incharge: Boolean(topic.use_shift_incharge),
      operational_category_id: topic.operational_category_id ? String(topic.operational_category_id) : "",
      is_public: topic.is_public,
      display_order: topic.display_order,
    });
    setModalOpen(true);
  };

  // Submit Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Please enter a contact topic title");
      return;
    }

    if (form.primary_type === "staff" && !form.primary_staff_id) {
      toast.error("Please select a primary staff member");
      return;
    }

    if (form.primary_type === "external" && !form.primary_name.trim()) {
      toast.error("Please enter a primary contact name");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category_name: form.category_name.trim() || null,
        is_public: form.is_public,
        display_order: Number(form.display_order) || 0,
        primary_type: form.primary_type,
        secondary_type: form.secondary_type,
        use_shift_incharge: form.use_shift_incharge,
      };

      if (form.primary_type === "staff") {
        payload.primary_staff_id = Number(form.primary_staff_id);
        payload.primary_name = null;
        payload.primary_phone = null;
        payload.primary_email = null;
        payload.primary_role = form.primary_role.trim() || null;
      } else {
        payload.primary_staff_id = null;
        payload.primary_name = form.primary_name.trim();
        payload.primary_phone = form.primary_phone.trim();
        payload.primary_email = form.primary_email.trim() || null;
        payload.primary_role = form.primary_role.trim() || null;
      }

      if (form.secondary_type === "staff") {
        payload.secondary_staff_id = Number(form.secondary_staff_id);
        payload.secondary_name = null;
        payload.secondary_phone = null;
        payload.secondary_email = null;
        payload.secondary_role = form.secondary_role.trim() || null;
      } else if (form.secondary_type === "external") {
        payload.secondary_staff_id = null;
        payload.secondary_name = form.secondary_name.trim();
        payload.secondary_phone = form.secondary_phone.trim();
        payload.secondary_email = form.secondary_email.trim() || null;
        payload.secondary_role = form.secondary_role.trim() || null;
      } else {
        payload.secondary_staff_id = null;
        payload.secondary_name = null;
        payload.secondary_phone = null;
        payload.secondary_email = null;
        payload.secondary_role = null;
      }

      if (form.use_shift_incharge && form.operational_category_id) {
        payload.operational_category_id = Number(form.operational_category_id);
      } else {
        payload.operational_category_id = null;
      }

      if (editingTopic) {
        await api.put(`/contacts/${editingTopic.id}`, payload);
        toast.success("Contact topic updated successfully");
      } else {
        await api.post("/contacts", payload);
        toast.success("Contact topic created successfully");
      }

      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error("Save contact error:", err);
      toast.error(err.response?.data?.detail || "Failed to save contact");
    } finally {
      setSaving(false);
    }
  };

  // Delete Contact Topic
  const handleDelete = async (topic: ContactTopic) => {
    if (!window.confirm(`Are you sure you want to delete "${topic.title}"?`)) return;
    try {
      await api.delete(`/contacts/${topic.id}`);
      toast.success("Contact topic deleted");
      await loadData();
    } catch (err) {
      console.error("Delete contact error:", err);
      toast.error("Failed to delete contact");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white font-heading">
              Contacts
            </h1>
            <Badge tone="gold" className="text-xs">
              Communication Directory
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Configure contact topics (Accommodation, Transport, Medical, Match Control) with Primary and Backup contacts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="gold" onClick={handleOpenCreate} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contact topics or names..."
            className="pl-9 bg-obsidian-900 border-white/15 text-white placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-2 sm:w-64">
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Contact Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400 font-mono">
          Loading contact directory...
        </div>
      ) : filteredTopics.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-obsidian-900/60 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gold mb-3">
            <Phone className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-white font-heading">No Contacts Found</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            {searchQuery
              ? "No contact topics matched your search criteria."
              : "Get started by adding your first contact topic such as Accommodation, Transport, or Medical Help."}
          </p>
          {!searchQuery && (
            <Button variant="gold" onClick={handleOpenCreate} size="sm" className="mt-4">
              <Plus className="h-4 w-4 mr-1.5" />
              Add First Contact
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTopics.map((topic) => {
            const primary = topic.primary_contact;
            const backup = topic.secondary_contact;
            const incharge = topic.current_incharge;

            return (
              <Card key={topic.id} className="flex flex-col justify-between border-white/10 bg-obsidian-900/90 hover:border-gold/40 transition-colors shadow-sm">
                <CardHeader className="pb-3 border-b border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-white">
                          {topic.title}
                        </CardTitle>
                      </div>
                      {(topic.category_name || topic.operational_category_name) && (
                        <span className="inline-block text-[11px] font-medium text-gold bg-gold/10 border border-gold/20 px-2 py-0.5 rounded font-mono">
                          {topic.category_name || topic.operational_category_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {topic.is_public ? (
                        <Badge tone="green" className="text-[10px]">
                          <Globe className="h-3 w-3 mr-1" />
                          Public
                        </Badge>
                      ) : (
                        <Badge tone="slate" className="text-[10px]">
                          <Lock className="h-3 w-3 mr-1" />
                          Organizer Only
                        </Badge>
                      )}
                    </div>
                  </div>
                  {topic.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {topic.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 pt-4 text-sm">
                  {/* Primary Contact Row */}
                  <div className="rounded-lg bg-obsidian-950 p-3 space-y-1.5 border border-white/10">
                    <div className="flex items-center justify-between text-[11px] font-heading font-bold uppercase tracking-wider text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-gold" />
                        Primary Contact
                      </span>
                      {primary?.is_staff ? (
                        <span className="text-[10px] text-gold font-mono">Staff Member</span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">External</span>
                      )}
                    </div>
                    {primary ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-heading font-bold text-white text-sm flex items-center gap-1.5">
                            {primary.name}
                            {primary.is_on_duty && (
                              <Badge tone="live" size="sm">
                                On Duty
                              </Badge>
                            )}
                          </div>
                          {primary.role && (
                            <div className="text-xs text-slate-400 font-medium">{primary.role}</div>
                          )}
                        </div>
                        {primary.phone ? (
                          <a
                            href={`tel:${primary.phone}`}
                            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-gold hover:text-amber-300 bg-gold/10 hover:bg-gold/20 px-2.5 py-1 rounded transition-colors"
                          >
                            <Phone className="h-3 w-3" />
                            {primary.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">No phone</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">No primary contact configured</div>
                    )}
                  </div>

                  {/* Backup Contact Row */}
                  <div className="rounded-lg bg-obsidian-950/60 p-2.5 space-y-1 border border-white/5">
                    <div className="flex items-center justify-between text-[11px] font-heading font-bold uppercase tracking-wider text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-slate-400" />
                        Backup Contact
                      </span>
                      {backup ? (
                        backup.is_staff ? (
                          <span className="text-[10px] text-slate-400 font-mono">Staff</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">External</span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">Optional</span>
                      )}
                    </div>
                    {backup ? (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-200 text-xs">{backup.name}</div>
                          {backup.role && (
                            <div className="text-[11px] text-slate-400">{backup.role}</div>
                          )}
                        </div>
                        {backup.phone ? (
                          <a
                            href={`tel:${backup.phone}`}
                            className="inline-flex items-center gap-1 text-xs font-mono text-slate-300 hover:text-white"
                          >
                            <Phone className="h-3 w-3" />
                            {backup.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">No phone</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">None configured</div>
                    )}
                  </div>

                  {/* Dynamic Shift Incharge Indicator */}
                  {topic.use_shift_incharge && (
                    <div className="flex items-center justify-between rounded bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400 border border-amber-500/20">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Zap className="h-3.5 w-3.5 text-amber-400" />
                        Shift Incharge Routing Active
                      </span>
                      {incharge ? (
                        <span className="font-bold text-emerald-400">
                          Active: {incharge.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Fallback to Primary</span>
                      )}
                    </div>
                  )}

                  {/* Card Actions Footer */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(topic)}
                      className="h-8 text-xs text-slate-300 hover:text-white gap-1"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(topic)}
                      className="h-8 text-xs gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Contact Topic Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTopic ? "Edit Contact Topic" : "Add Contact Topic"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* Section 1: Topic Information */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-heading border-b border-white/10 pb-1.5">
              Topic Information
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="title">Topic Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Accommodation Help, Transport Help, Medical Help"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Short Description (Optional)</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Room allocation, extra bedding, and hostel assistance"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category_name">Category / Area Label</Label>
                <Input
                  id="category_name"
                  value={form.category_name}
                  onChange={(e) => setForm({ ...form, category_name: e.target.value })}
                  placeholder="e.g. Accommodation"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="display_order">Sort Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Primary Contact */}
          <div className="space-y-3 rounded-lg border border-white/10 p-3.5 bg-obsidian-950">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white font-heading">
                Primary Contact
              </h4>
              <div className="flex items-center gap-1 bg-obsidian-900 rounded-lg p-1 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, primary_type: "staff" })}
                  className={`px-3 py-1 rounded text-xs font-heading font-bold transition-colors ${
                    form.primary_type === "staff"
                      ? "bg-gold text-obsidian shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Staff Member
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, primary_type: "external" })}
                  className={`px-3 py-1 rounded text-xs font-heading font-bold transition-colors ${
                    form.primary_type === "external"
                      ? "bg-gold text-obsidian shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  External Contact
                </button>
              </div>
            </div>

            {form.primary_type === "staff" ? (
              <div className="space-y-2">
                <Label htmlFor="primary_staff">Select Staff Member *</Label>
                <Select
                  id="primary_staff"
                  value={form.primary_staff_id}
                  onChange={(e) => {
                    const stId = e.target.value;
                    const st = staffList.find((s) => String(s.id) === stId);
                    setForm({
                      ...form,
                      primary_staff_id: stId,
                      primary_role: st?.designation || "",
                    });
                  }}
                  required
                >
                  <option value="">-- Choose from Staff Directory --</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} {s.phone ? `(${s.phone})` : ""} {s.designation ? `• ${s.designation}` : ""}
                    </option>
                  ))}
                </Select>
                <p className="text-[11px] text-slate-400">
                  Phone and contact details resolve dynamically from Staff. Updating them in Staff updates Contacts automatically.
                </p>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="primary_name">Name / Organization *</Label>
                  <Input
                    id="primary_name"
                    value={form.primary_name}
                    onChange={(e) => setForm({ ...form, primary_name: e.target.value })}
                    placeholder="e.g. City General Hospital, Central Police Control"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="primary_phone">Phone Number *</Label>
                  <Input
                    id="primary_phone"
                    value={form.primary_phone}
                    onChange={(e) => setForm({ ...form, primary_phone: e.target.value })}
                    placeholder="e.g. +91 98765 00000 or 108"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="primary_role">Role / Label</Label>
                  <Input
                    id="primary_role"
                    value={form.primary_role}
                    onChange={(e) => setForm({ ...form, primary_role: e.target.value })}
                    placeholder="e.g. Trauma Center, Emergency Helpline"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Backup Contact */}
          <div className="space-y-3 rounded-lg border border-white/10 p-3.5 bg-obsidian-950">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white font-heading">
                Backup Contact (Optional)
              </h4>
              <div className="flex items-center gap-1 bg-obsidian-900 rounded-lg p-1 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, secondary_type: "none" })}
                  className={`px-3 py-1 rounded text-xs font-heading font-bold transition-colors ${
                    form.secondary_type === "none"
                      ? "bg-gold text-obsidian shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, secondary_type: "staff" })}
                  className={`px-3 py-1 rounded text-xs font-heading font-bold transition-colors ${
                    form.secondary_type === "staff"
                      ? "bg-gold text-obsidian shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, secondary_type: "external" })}
                  className={`px-3 py-1 rounded text-xs font-heading font-bold transition-colors ${
                    form.secondary_type === "external"
                      ? "bg-gold text-obsidian shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  External
                </button>
              </div>
            </div>

            {form.secondary_type === "staff" && (
              <div className="space-y-2">
                <Label htmlFor="secondary_staff">Select Backup Staff Member</Label>
                <Select
                  id="secondary_staff"
                  value={form.secondary_staff_id}
                  onChange={(e) => {
                    const stId = e.target.value;
                    const st = staffList.find((s) => String(s.id) === stId);
                    setForm({
                      ...form,
                      secondary_staff_id: stId,
                      secondary_role: st?.designation || "",
                    });
                  }}
                >
                  <option value="">-- Choose from Staff Directory --</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} {s.phone ? `(${s.phone})` : ""} {s.designation ? `• ${s.designation}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {form.secondary_type === "external" && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="secondary_name">Name / Service</Label>
                  <Input
                    id="secondary_name"
                    value={form.secondary_name}
                    onChange={(e) => setForm({ ...form, secondary_name: e.target.value })}
                    placeholder="e.g. Dr. Rajesh Sharma, Ambulance 2"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="secondary_phone">Phone Number</Label>
                  <Input
                    id="secondary_phone"
                    value={form.secondary_phone}
                    onChange={(e) => setForm({ ...form, secondary_phone: e.target.value })}
                    placeholder="e.g. +91 98765 11111"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="secondary_role">Role / Label</Label>
                  <Input
                    id="secondary_role"
                    value={form.secondary_role}
                    onChange={(e) => setForm({ ...form, secondary_role: e.target.value })}
                    placeholder="e.g. Backup Driver, Duty Doctor"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Dynamic Shift Incharge Routing */}
          <div className="space-y-3 rounded-lg border border-white/10 p-3.5 bg-obsidian-950">
            <div className="flex items-start gap-2.5">
              <input
                id="use_shift_incharge"
                type="checkbox"
                checked={form.use_shift_incharge}
                onChange={(e) => setForm({ ...form, use_shift_incharge: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-obsidian-900 text-gold focus:ring-gold accent-amber-500"
              />
              <div className="space-y-1">
                <Label htmlFor="use_shift_incharge" className="font-bold text-white cursor-pointer mb-0">
                  Use current shift incharge when available
                </Label>
                <p className="text-xs text-slate-400">
                  When enabled, if there is an active shift block with an assigned incharge for this operational category, that person appears first. Otherwise falls back cleanly to the configured primary contact.
                </p>
              </div>
            </div>

            {form.use_shift_incharge && (
              <div className="pt-2 space-y-1.5">
                <Label htmlFor="operational_cat">Operational Category / Area for Incharge Resolution</Label>
                <Select
                  id="operational_cat"
                  value={form.operational_category_id}
                  onChange={(e) => setForm({ ...form, operational_category_id: e.target.value })}
                >
                  <option value="">-- Select Operational Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Section 5: Visibility */}
          <div className="flex items-center justify-between rounded-lg border border-white/10 p-3.5 bg-obsidian-950">
            <div className="space-y-0.5">
              <Label htmlFor="is_public" className="font-bold text-white mb-0">
                Public Visibility
              </Label>
              <p className="text-xs text-slate-400">
                Display this contact on the public helpline and visiting delegations team portal.
              </p>
            </div>
            <input
              id="is_public"
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-obsidian-900 text-gold focus:ring-gold accent-amber-500"
            />
          </div>

          {/* Dialog Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gold" disabled={saving}>
              {saving ? "Saving..." : editingTopic ? "Save Changes" : "Create Contact"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
export default Contacts;
