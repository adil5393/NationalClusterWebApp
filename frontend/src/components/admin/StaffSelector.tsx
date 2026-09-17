import { useEffect, useRef, useState, useMemo } from "react";
import { Search, X, Check, ChevronsUpDown, User, Phone, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface StaffOption {
  id: number;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  category?: string | null;
}

interface StaffSelectorProps {
  staff: StaffOption[];
  value: number | string | null | undefined;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  testId?: string;
}

export function StaffSelector({
  staff,
  value,
  onChange,
  placeholder = "Search and select staff member…",
  className,
  disabled = false,
  allowClear = true,
  testId = "staff-selector",
}: StaffSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedId = value ? Number(value) : null;
  const selectedMember = useMemo(
    () => staff.find((s) => s.id === selectedId) || null,
    [staff, selectedId],
  );

  const sortedStaff = useMemo(() => {
    return [...staff].sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
    );
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedStaff;
    return sortedStaff.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)),
    );
  }, [sortedStaff, search]);

  // Group by category, sorting members within each category alphabetically
  const groupedStaff = useMemo(() => {
    const map = new Map<string, StaffOption[]>();
    for (const s of filteredStaff) {
      const cat = s.category?.trim() || "General / Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, members]) => [
        cat,
        members.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })),
      ] as [string, StaffOption[]]);
  }, [filteredStaff]);

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [open]);

  const handleSelect = (s: StaffOption) => {
    onChange(s.id);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)} data-testid={testId}>
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        data-testid={`${testId}-trigger`}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border bg-obsidian-950 px-3 text-xs font-body text-left transition-colors focus:outline-none focus:ring-1 focus:ring-gold",
          open ? "border-gold ring-1 ring-gold" : "border-white/10 hover:border-white/20",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          {selectedMember ? (
            <div className="flex items-center gap-2 min-w-0 truncate">
              <div className="grid h-5 w-5 shrink-0 place-items-center rounded bg-gold/15 text-gold font-heading font-black text-[10px]">
                {selectedMember.full_name.slice(0, 1).toUpperCase()}
              </div>
              <span className="font-heading font-bold text-white truncate text-xs">
                {selectedMember.full_name}
              </span>
              {selectedMember.category && (
                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                  {selectedMember.category}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-500 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {allowClear && selectedMember && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:text-white rounded hover:bg-white/10"
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </div>
      </button>

      {/* DROPDOWN POPOVER */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] rounded-lg border border-white/15 bg-obsidian-900 shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100"
          data-testid={`${testId}-dropdown`}
        >
          {/* SEARCH INPUT */}
          <div className="border-b border-white/10 p-2 bg-obsidian-950">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type name, phone, or category…"
                className="h-8 w-full rounded-md border border-white/10 bg-obsidian-900 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-gold focus:outline-none"
                data-testid={`${testId}-search-input`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* LIST ITEMS */}
          <div className="max-h-56 overflow-y-auto divide-y divide-white/5 p-1">
            {staff.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-500 font-body">
                No staff personnel available.
              </p>
            ) : filteredStaff.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-500 font-body">
                No staff matching "{search}".
              </p>
            ) : (
              groupedStaff.map(([cat, members]) => (
                <div key={cat} className="py-1">
                  <div className="px-2 py-1 text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Tag className="h-2.5 w-2.5 text-gold/70" />
                    <span>{cat}</span>
                  </div>
                  <div className="space-y-0.5">
                    {members.map((s) => {
                      const isSelected = selectedId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelect(s)}
                          data-testid={`${testId}-option-${s.id}`}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                            isSelected
                              ? "bg-gold/15 text-gold font-bold"
                              : "text-slate-200 hover:bg-white/5 hover:text-white",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-heading font-semibold text-white truncate">
                                {s.full_name}
                              </span>
                              {s.category && s.category !== cat && (
                                <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] text-slate-300">
                                  {s.category}
                                </span>
                              )}
                            </div>
                            {s.phone && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono mt-0.5">
                                <Phone className="h-2.5 w-2.5 text-slate-500" />
                                <span>{s.phone}</span>
                              </div>
                            )}
                          </div>
                          {isSelected && <Check className="h-3.5 w-3.5 text-gold shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Multi-select version for Account linking */
interface MultiStaffSelectorProps {
  staff: StaffOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  className?: string;
  disabled?: boolean;
}

export function MultiStaffSelector({
  staff,
  selectedIds,
  onChange,
  className,
  disabled = false,
}: MultiStaffSelectorProps) {
  const [search, setSearch] = useState("");

  const sortedStaff = useMemo(() => {
    return [...staff].sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
    );
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedStaff;
    return sortedStaff.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)),
    );
  }, [sortedStaff, search]);

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onChange(filteredStaff.map((s) => s.id));
  const clearAll = () => onChange([]);

  return (
    <div className={cn("space-y-2 rounded-lg border border-white/10 bg-obsidian-950 p-2.5", className)}>
      {/* SEARCH & BULK ACTIONS */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff to link…"
            disabled={disabled}
            className="h-8 w-full rounded-md border border-white/10 bg-obsidian-900 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-gold focus:outline-none"
          />
        </div>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="text-[11px] font-semibold text-gold hover:underline shrink-0"
          >
            Clear ({selectedIds.length})
          </button>
        )}
      </div>

      {/* STAFF LIST */}
      <div className="max-h-40 overflow-y-auto divide-y divide-white/5 pr-1">
        {staff.length === 0 ? (
          <p className="p-2 text-xs text-slate-500">No staff members enrolled yet.</p>
        ) : filteredStaff.length === 0 ? (
          <p className="p-2 text-xs text-slate-500">No staff matching "{search}".</p>
        ) : (
          filteredStaff.map((s) => {
            const checked = selectedIds.includes(s.id);
            return (
              <label
                key={s.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors",
                  checked ? "bg-gold/10 text-white" : "text-slate-300 hover:bg-white/5",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    disabled={disabled}
                    className="rounded border-white/20 text-gold focus:ring-gold"
                  />
                  <span className="font-medium text-white truncate">{s.full_name}</span>
                </div>
                {s.category && (
                  <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-mono text-gold shrink-0">
                    {s.category}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
