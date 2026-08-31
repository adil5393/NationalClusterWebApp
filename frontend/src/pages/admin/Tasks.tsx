import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Plus, Square, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { groupStaffByCategory } from "@/lib/meta";

interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  category: string;
  owner?: string | null;
  assigned_staff_id?: number | null;
  assigned_staff_name?: string | null;
  due_date?: string | null;
}
interface StaffOpt {
  id: number;
  full_name: string;
  category?: string | null;
}

const empty = { title: "", category: "General", description: "", assigned_staff_id: "" };

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => {
    setLoading(true);
    Promise.all([api.get<Task[]>("/tasks"), api.get<StaffOpt[]>("/staff")])
      .then(([t, s]) => {
        setTasks(t.data);
        setStaff(s.data);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const categories = useMemo(() => {
    const byCategory = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category)!.push(t);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  const existingCategories = useMemo(() => [...new Set(tasks.map((t) => t.category))].sort(), [tasks]);
  const staffByCategory = useMemo(() => groupStaffByCategory(staff), [staff]);

  const createTask = async () => {
    if (!form.title.trim()) return toast.error("Task title is required");
    try {
      await api.post("/tasks", {
        title: form.title,
        category: form.category.trim() || "General",
        description: form.description || null,
        assigned_staff_id: form.assigned_staff_id ? Number(form.assigned_staff_id) : null,
      });
      toast.success("Task added to the board");
      setForm(empty);
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Could not create task");
    }
  };

  const toggleStatus = async (t: Task) => {
    const next = t.status === "completed" ? "pending" : "completed";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await api.put(`/tasks/${t.id}`, { status: next });
    } catch {
      toast.error("Could not update task");
      load();
    }
  };

  const removeTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    await api.delete(`/tasks/${id}`);
    toast.success("Task deleted");
    load();
  };

  if (loading) {
    return (
      <div className="py-20">
        <Spinner label="Loading the staff task board…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-tasks" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            SHARED OPERATIONS BOARD
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">Tasks</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Every staff account sees the same board. Organize into lists, optionally assign to someone, check off when
            done.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setForm(empty);
            setOpen(true);
          }}
          data-testid="add-task-btn"
          className="text-xs font-extrabold"
        >
          <Plus className="h-4 w-4" /> Add Task
        </Button>
      </div>

      {/* TASK BOARD */}
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
          <EmptyState title="No tasks yet" hint="Add the first task to start a list." icon={CheckSquare} />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="task-lists">
          {categories.map(([category, items]) => {
            const pendingCount = items.filter((t) => t.status !== "completed").length;
            return (
              <div
                key={category}
                data-testid={`task-list-${category}`}
                className="rounded-xl border border-white/10 bg-obsidian-900 shadow-sm overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-white/10 bg-obsidian-950 px-4 py-3">
                  <h2 className="font-heading text-sm font-bold text-white">{category}</h2>
                  <span className="text-[11px] font-mono text-slate-400">
                    {pendingCount} pending / {items.length}
                  </span>
                </div>
                <div className="divide-y divide-white/5">
                  {items.map((t) => {
                    const done = t.status === "completed";
                    return (
                      <div key={t.id} data-testid={`task-row-${t.id}`} className="flex items-start gap-2.5 p-3.5">
                        <button
                          onClick={() => toggleStatus(t)}
                          data-testid={`toggle-task-${t.id}`}
                          className="mt-0.5 shrink-0 text-gold hover:text-gold-400"
                          title={done ? "Mark pending" : "Mark done"}
                        >
                          {done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-slate-500" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-body ${done ? "text-slate-500 line-through" : "text-white font-semibold"}`}
                          >
                            {t.title}
                          </p>
                          {t.description && (
                            <p className="mt-0.5 text-xs text-slate-400 font-body line-clamp-2">{t.description}</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {t.assigned_staff_name && (
                              <Badge tone="gold" size="sm">
                                <User className="h-3 w-3" /> {t.assigned_staff_name}
                              </Badge>
                            )}
                            {t.owner && <span className="text-[10px] text-slate-500 font-mono">by {t.owner}</span>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeTask(t.id)}
                          data-testid={`delete-task-${t.id}`}
                          title="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD TASK DIALOG */}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add Task" testId="task-dialog">
        <div className="space-y-4">
          <div>
            <Label>Task Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Set up registration desk"
              data-testid="task-title-input"
            />
          </div>
          <div>
            <Label>List / Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Setup, Registration Desk, Closing Ceremony"
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
            <Label>Assign To (Optional)</Label>
            <Select
              value={form.assigned_staff_id}
              onChange={(e) => setForm((f) => ({ ...f, assigned_staff_id: e.target.value }))}
              data-testid="task-assignee-select"
            >
              <option value="">Unassigned / whole team</option>
              {staffByCategory.map(([category, members]) => (
                <optgroup key={category} label={category}>
                  {members.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Any extra detail…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={createTask} data-testid="save-task-btn">
              Add to Board
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
