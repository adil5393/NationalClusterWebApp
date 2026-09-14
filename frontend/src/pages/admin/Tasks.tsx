import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  Plus,
  Square,
  Trash2,
  User,
  Search,
  Clock,
  Filter,
  Tag,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { StaffSelector, StaffOption } from "@/components/admin/StaffSelector";

interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  category: string;
  owner?: string | null;
  assigned_staff_id?: number | null;
  assigned_staff_name?: string | null;
  due_date?: string | null;
  created_at?: string | null;
}

const emptyTaskForm = {
  id: undefined as number | undefined,
  title: "",
  category: "General",
  description: "",
  priority: "medium",
  assigned_staff_id: null as number | null,
  due_date: "",
};

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStaffId, setFilterStaffId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [filterPriority, setFilterPriority] = useState<string>("ALL");

  // Modal State
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyTaskForm);

  const load = () => {
    setLoading(true);
    Promise.all([api.get<Task[]>("/tasks"), api.get<StaffOption[]>("/staff")])
      .then(([t, s]) => {
        setTasks(t.data);
        setStaff(s.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const existingCategories = useMemo(() => {
    const set = new Set(tasks.map((t) => t.category).filter(Boolean));
    if (set.size === 0) set.add("General");
    return Array.from(set).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.assigned_staff_name && t.assigned_staff_name.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q));

      const matchesStaff = !filterStaffId || t.assigned_staff_id === filterStaffId;
      const matchesCat = filterCategory === "ALL" || t.category === filterCategory;
      const matchesStatus =
        filterStatus === "ALL" ||
        (filterStatus === "PENDING" && t.status !== "completed") ||
        (filterStatus === "COMPLETED" && t.status === "completed");
      const matchesPriority =
        filterPriority === "ALL" || (t.priority || "medium").toLowerCase() === filterPriority.toLowerCase();

      return matchesSearch && matchesStaff && matchesCat && matchesStatus && matchesPriority;
    });
  }, [tasks, search, filterStaffId, filterCategory, filterStatus, filterPriority]);

  // Group by category
  const categoriesWithTasks = useMemo(() => {
    const byCategory = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      const cat = t.category || "General";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(t);
    }
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks]);

  const openCreateDialog = () => {
    setForm(emptyTaskForm);
    setOpen(true);
  };

  const openEditDialog = (t: Task) => {
    setForm({
      id: t.id,
      title: t.title,
      category: t.category || "General",
      description: t.description || "",
      priority: t.priority || "medium",
      assigned_staff_id: t.assigned_staff_id || null,
      due_date: t.due_date ? t.due_date.slice(0, 16) : "",
    });
    setOpen(true);
  };

  const saveTask = async () => {
    if (!form.title.trim()) return toast.error("Task title is required");
    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || "General",
      description: form.description.trim() || null,
      priority: form.priority || "medium",
      assigned_staff_id: form.assigned_staff_id ? Number(form.assigned_staff_id) : null,
      due_date: form.due_date || null,
    };
    try {
      if (form.id) {
        await api.put(`/tasks/${form.id}`, payload);
        toast.success("Task updated");
      } else {
        await api.post("/tasks", payload);
        toast.success("Task added to board");
      }
      setForm(emptyTaskForm);
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not save task");
    }
  };

  const toggleStatus = async (t: Task) => {
    const next = t.status === "completed" ? "pending" : "completed";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await api.put(`/tasks/${t.id}`, { status: next });
    } catch {
      toast.error("Could not update task status");
      load();
    }
  };

  const removeTask = async (id: number) => {
    if (!confirm("Delete this task from the board?")) return;
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Task deleted");
      load();
    } catch {
      toast.error("Could not delete task");
    }
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading operational task boards…" />
      </div>
    );
  }

  const pendingCount = tasks.filter((t) => t.status !== "completed").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div data-testid="admin-tasks" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            OPERATIONAL WORKFLOWS
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">Tasks</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Assign and track on-ground responsibilities assigned to tournament personnel.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={openCreateDialog}
          data-testid="add-task-btn"
          className="text-xs font-extrabold shrink-0"
        >
          <Plus className="h-4 w-4" /> Add Task
        </Button>
      </div>

      {/* METRIC ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Total Tasks
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-white">{tasks.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Pending / In Progress
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-amber-400">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Completed Tasks
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-emerald-400">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-1">
          <p className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-slate-400">
            Task Categories
          </p>
          <p className="font-heading text-xl sm:text-2xl font-black text-gold">{existingCategories.length}</p>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="rounded-xl border border-white/10 bg-obsidian-900 p-3.5 space-y-3 shadow-sm">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search tasks or assignee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
              data-testid="task-search-input"
            />
          </div>

          <div>
            <StaffSelector
              staff={staff}
              value={filterStaffId}
              onChange={setFilterStaffId}
              placeholder="Filter by assigned staff…"
              testId="task-staff-filter"
            />
          </div>

          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 text-xs"
          >
            <option value="ALL">All Categories</option>
            {existingCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="h-9 text-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending / In Progress</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </div>
      </div>

      {/* TASK BOARDS / CARDS */}
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState title="No tasks on the board" hint="Add your first operational task to assign personnel." />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-8">
          <EmptyState title="No matching tasks" hint="Try adjusting your active filters or search terms." />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="task-lists">
          {categoriesWithTasks.map(([category, items]) => {
            const pendingCat = items.filter((t) => t.status !== "completed").length;
            return (
              <div
                key={category}
                data-testid={`task-list-${category}`}
                className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm overflow-hidden flex flex-col"
              >
                {/* LIST HEADER */}
                <div className="flex items-center justify-between border-b border-white/10 bg-obsidian-950 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-gold" />
                    <h2 className="font-heading text-sm font-bold text-white">{category}</h2>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {pendingCat} open / {items.length}
                  </span>
                </div>

                {/* TASK ITEMS */}
                <div className="divide-y divide-white/5 flex-1">
                  {items.map((t) => {
                    const done = t.status === "completed";
                    return (
                      <div
                        key={t.id}
                        data-testid={`task-row-${t.id}`}
                        className="p-3.5 space-y-2.5 transition-colors hover:bg-white/[0.01]"
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleStatus(t)}
                            data-testid={`toggle-task-${t.id}`}
                            className="mt-0.5 shrink-0 text-gold hover:text-gold-400"
                            title={done ? "Mark pending" : "Mark completed"}
                          >
                            {done ? (
                              <CheckSquare className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Square className="h-4 w-4 text-slate-500" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-xs font-body leading-snug font-bold",
                                done ? "text-slate-500 line-through" : "text-white",
                              )}
                            >
                              {t.title}
                            </p>
                            {t.description && (
                              <p className="mt-1 text-[11px] text-slate-400 font-body line-clamp-2">
                                {t.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEditDialog(t)}
                              title="Edit Task"
                            >
                              <Pencil className="h-3 w-3 text-slate-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeTask(t.id)}
                              data-testid={`delete-task-${t.id}`}
                              title="Delete Task"
                            >
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </Button>
                          </div>
                        </div>

                        {/* ASSIGNED STAFF & STATUS BADGES (PRIMARY) */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-white/5 pt-2">
                          <div className="flex items-center gap-1.5">
                            {t.assigned_staff_name ? (
                              <span className="inline-flex items-center gap-1 rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-[11px] font-heading font-bold text-gold">
                                <User className="h-3 w-3" />
                                {t.assigned_staff_name}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Unassigned</span>
                            )}
                            {t.priority && (
                              <Badge
                                tone={
                                  t.priority === "high"
                                    ? "coral"
                                    : t.priority === "medium"
                                      ? "gold"
                                      : "neutral"
                                }
                                size="sm"
                              >
                                {t.priority.toUpperCase()}
                              </Badge>
                            )}
                          </div>

                          {/* TIMING OR DUE DATE */}
                          {t.due_date && (
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatDate(t.due_date)}
                            </span>
                          )}
                        </div>

                        {/* SECONDARY OWNER INFO */}
                        {t.owner && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Created by @{t.owner}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT TASK DIALOG */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Edit Task" : "Add Task to Board"}
        testId="task-dialog"
      >
        <div className="space-y-3.5">
          <div>
            <Label>Task Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Inspect Mat 2 scoreboard & referee desk"
              data-testid="task-title-input"
            />
          </div>

          <div>
            <Label>Assigned Staff Member</Label>
            <StaffSelector
              staff={staff}
              value={form.assigned_staff_id}
              onChange={(id) => setForm((f) => ({ ...f, assigned_staff_id: id }))}
              placeholder="Select assigned personnel (or unassigned)…"
              testId="task-staff-selector"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Category / Board List</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Arena Setup, Registration, Medical"
                list="task-category-suggestions"
                data-testid="task-category-input"
              />
              <datalist id="task-category-suggestions">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>
          </div>

          <div>
            <Label>Due Date / Target Time (Optional)</Label>
            <Input
              type="datetime-local"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
            />
          </div>

          <div>
            <Label>Description / Instructions</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Detailed operational steps, room location, or required equipment…"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={saveTask} data-testid="save-task-btn">
              {form.id ? "Update Task" : "Add to Board"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
