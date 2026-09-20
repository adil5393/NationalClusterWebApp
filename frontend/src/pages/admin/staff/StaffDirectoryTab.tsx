import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Eye,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { StaffMember } from "./types";

interface StaffDirectoryTabProps {
  staff: StaffMember[];
  staffCategories: string[];
  activeNowCount: number;
  canEdit: boolean;
  onOpenAdd: () => void;
  onOpenEdit: (member: StaffMember) => void;
  onDelete: (id: number) => void;
  onOpenDrawer: (member: StaffMember) => void;
  onCreateCredential: (member: StaffMember) => void;
  creatingCredentialId: number | null;
}

const PAGE_SIZE = 15;

export function StaffDirectoryTab({
  staff,
  staffCategories,
  activeNowCount,
  canEdit,
  onOpenAdd,
  onOpenEdit,
  onDelete,
  onOpenDrawer,
  onCreateCredential,
  creatingCredentialId,
}: StaffDirectoryTabProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [loginFilter, setLoginFilter] = useState<"ALL" | "HAS_LOGIN" | "NO_LOGIN">("ALL");
  const [page, setPage] = useState(1);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      const matchesSearch =
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.languages ?? []).some((l) => l.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === "ALL" || (s.category || "").toLowerCase() === selectedCategory.toLowerCase();

      const matchesLogin =
        loginFilter === "ALL" ||
        (loginFilter === "HAS_LOGIN" && Boolean(s.login_username)) ||
        (loginFilter === "NO_LOGIN" && !s.login_username);

      return matchesSearch && matchesCat && matchesLogin;
    });
  }, [staff, search, selectedCategory, loginFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, loginFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const pagedStaff = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredStaff.slice(start, start + PAGE_SIZE);
  }, [filteredStaff, page]);

  const totalLogins = useMemo(() => staff.filter((s) => s.login_username).length, [staff]);

  return (
    <div className="space-y-4" data-testid="staff-directory-tab">
      {/* DIRECTORY METRICS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Staff
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">{staff.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            With Portal Access
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{totalLogins}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Roles & Categories
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-gold">{staffCategories.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Active On Shift
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-cyan-400">{activeNowCount}</p>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search by name, phone, email, role category, or language…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="staff-search-input"
            />
          </div>

          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 text-xs sm:w-48"
          >
            <option value="ALL">All Categories</option>
            {staffCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select
            value={loginFilter}
            onChange={(e) => setLoginFilter(e.target.value as any)}
            className="h-9 text-xs sm:w-40"
          >
            <option value="ALL">All Accounts</option>
            <option value="HAS_LOGIN">With Login</option>
            <option value="NO_LOGIN">No Login</option>
          </Select>

          {canEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={onOpenAdd}
              data-testid="add-staff-top-btn"
              className="h-9 text-xs font-bold shrink-0"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Staff
            </Button>
          )}
        </div>

        {/* ACTIVE FILTER PILLS */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-slate-400 font-mono">
            Showing {filteredStaff.length} of {staff.length} staff
          </span>
          {selectedCategory !== "ALL" && (
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className="inline-flex items-center gap-1 rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-[10px] font-bold text-gold"
            >
              Category: {selectedCategory} ×
            </button>
          )}
          {loginFilter !== "ALL" && (
            <button
              type="button"
              onClick={() => setLoginFilter("ALL")}
              className="inline-flex items-center gap-1 rounded bg-white/10 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-slate-300"
            >
              Account: {loginFilter === "HAS_LOGIN" ? "With Login" : "No Login"} ×
            </button>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1 rounded bg-white/10 border border-white/20 px-2 py-0.5 text-[10px] font-bold text-slate-300"
            >
              Search: "{search}" ×
            </button>
          )}
        </div>
      </div>

      {/* STAFF DIRECTORY TABLE */}
      {filteredStaff.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState
            title="No Staff Found"
            hint={
              staff.length === 0
                ? "Your staff directory is empty. Add staff members to get started."
                : "No personnel match your current filters. Try resetting the search or category."
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Staff Member</TH>
                <TH>Role / Category</TH>
                <TH>Languages</TH>
                <TH>Contact</TH>
                <TH>Account Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {pagedStaff.map((s) => (
                <TR key={s.id} className="hover:bg-white/[0.02] transition-colors">
                  {/* NAME + DETAILS TRIGGER */}
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/30 bg-gold/10 font-heading font-black text-xs text-gold">
                        {s.full_name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenDrawer(s)}
                          className="font-heading font-bold text-white text-xs hover:text-gold transition-colors truncate block text-left"
                          data-testid={`staff-row-name-${s.id}`}
                        >
                          {s.full_name}
                        </button>
                        {s.notes && (
                          <p className="text-[11px] text-slate-400 font-body truncate max-w-xs">
                            {s.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </TD>

                  {/* CATEGORY */}
                  <TD>
                    {s.category ? (
                      <Badge tone="gold" className="text-[10px] uppercase tracking-wider">
                        {s.category}
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic font-mono">—</span>
                    )}
                  </TD>

                  {/* LANGUAGES */}
                  <TD>
                    {s.languages && s.languages.length > 0 ? (
                      <div className="flex max-w-[180px] flex-wrap gap-1">
                        {s.languages.map((lang) => (
                          <Badge key={lang} tone="neutral" size="sm">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic font-mono">—</span>
                    )}
                  </TD>

                  {/* CONTACT */}
                  <TD>
                    <div className="space-y-0.5 text-xs font-mono">
                      {s.phone ? (
                        <a
                          href={`tel:${s.phone}`}
                          className="flex items-center gap-1 text-slate-300 hover:text-gold transition-colors"
                        >
                          <Phone className="h-3 w-3 text-gold/70" />
                          {s.phone}
                        </a>
                      ) : (
                        <span className="text-slate-600 block">—</span>
                      )}
                      {s.email && (
                        <a
                          href={`mailto:${s.email}`}
                          className="flex items-center gap-1 text-slate-400 hover:text-gold transition-colors font-sans text-[11px]"
                        >
                          <Mail className="h-3 w-3 text-slate-500" />
                          {s.email}
                        </a>
                      )}
                    </div>
                  </TD>

                  {/* ACCOUNT STATUS */}
                  <TD>
                    {s.login_username ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-emerald-400/50 shadow-xs" />
                        <span className="font-mono text-xs text-emerald-400 font-bold">
                          {s.login_username}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500">No login created</span>
                    )}
                  </TD>

                  {/* ACTIONS */}
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onOpenDrawer(s)}
                        data-testid={`view-staff-${s.id}`}
                        title="View Profile Details"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-300" />
                      </Button>

                      {canEdit && (
                        <>
                          {!s.login_username && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => onCreateCredential(s)}
                              disabled={creatingCredentialId === s.id}
                              data-testid={`create-credential-${s.id}`}
                              title="Create Portal Login"
                            >
                              <KeyRound className="h-3.5 w-3.5 text-gold" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onOpenEdit(s)}
                            data-testid={`edit-staff-${s.id}`}
                            title="Edit Staff"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-300" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDelete(s.id)}
                            data-testid={`delete-staff-${s.id}`}
                            title="Delete Staff"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-400 font-mono">
              <span>
                Page {page} of {totalPages} · {filteredStaff.length} Total Staff
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 text-xs"
                >
                  <ChevronLeft className="h-3 w-3" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 text-xs"
                >
                  Next <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
