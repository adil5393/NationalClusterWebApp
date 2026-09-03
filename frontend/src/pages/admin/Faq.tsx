import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD, TBody } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useModuleAccess } from "@/lib/permissions";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  sequence: number;
  is_published: boolean;
}

interface FaqQuestion {
  id: number;
  name?: string | null;
  email?: string | null;
  question: string;
  status: "new" | "promoted" | "dismissed";
  promoted_faq_id?: number | null;
  created_at: string;
}

const emptyForm = { question: "", answer: "", category: "General", sequence: "0", is_published: "true" };
const emptyPromoteForm = { answer: "", category: "General", sequence: "0", is_published: "true" };

export default function AdminFaq() {
  const { canEdit } = useModuleAccess("faq");
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const [questions, setQuestions] = useState<FaqQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [promoteTarget, setPromoteTarget] = useState<FaqQuestion | null>(null);
  const [promoteForm, setPromoteForm] = useState<Record<string, string>>(emptyPromoteForm);

  const load = () => {
    setLoading(true);
    api
      .get<FaqItem[]>("/faqs")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const loadQuestions = () => {
    setQuestionsLoading(true);
    api
      .get<FaqQuestion[]>("/faqs/questions")
      .then((r) => setQuestions(r.data))
      .finally(() => setQuestionsLoading(false));
  };
  useEffect(loadQuestions, []);

  const openPromote = (q: FaqQuestion) => {
    setPromoteTarget(q);
    setPromoteForm(emptyPromoteForm);
  };

  const submitPromote = async () => {
    if (!promoteTarget) return;
    if (!promoteForm.answer.trim()) return toast.error("Enter an answer");
    try {
      await api.post(`/faqs/questions/${promoteTarget.id}/promote`, {
        answer: promoteForm.answer,
        category: promoteForm.category.trim() || "General",
        sequence: Number(promoteForm.sequence) || 0,
        is_published: promoteForm.is_published === "true",
      });
      toast.success("Promoted to a published FAQ");
      setPromoteTarget(null);
      loadQuestions();
      load();
    } catch {
      toast.error("Could not promote this question");
    }
  };

  const dismissQuestion = async (id: number) => {
    try {
      await api.post(`/faqs/questions/${id}/dismiss`);
      toast.success("Dismissed");
      loadQuestions();
    } catch {
      toast.error("Could not dismiss this question");
    }
  };

  const deleteQuestion = async (id: number) => {
    if (!confirm("Remove this submitted question?")) return;
    await api.delete(`/faqs/questions/${id}`);
    toast.success("Removed");
    loadQuestions();
  };

  const openNew = () => {
    setForm({ ...emptyForm, sequence: String(items.length) });
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (f: FaqItem) => {
    setForm({
      question: f.question,
      answer: f.answer,
      category: f.category,
      sequence: String(f.sequence),
      is_published: String(f.is_published),
    });
    setEditId(f.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.question.trim() || !form.answer.trim())
      return toast.error("Question and answer are required");
    const payload = {
      question: form.question,
      answer: form.answer,
      category: form.category.trim() || "General",
      sequence: Number(form.sequence) || 0,
      is_published: form.is_published === "true",
    };
    try {
      if (editId) await api.put(`/faqs/${editId}`, payload);
      else await api.post("/faqs", payload);
      toast.success(editId ? "FAQ updated" : "FAQ added");
      setOpen(false);
      load();
    } catch {
      toast.error("Could not save FAQ");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this FAQ?")) return;
    await api.delete(`/faqs/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="admin-faq" className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/10 pb-5">
        <div>
          <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
            PUBLIC KNOWLEDGE
          </span>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl font-black tracking-tight text-white">
            Frequently Asked Questions
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Manage the Q&A shown on the public FAQ page. Order controls display sequence (lowest first).
          </p>
        </div>
        {canEdit && (
          <Button
            variant="gold"
            size="sm"
            onClick={openNew}
            data-testid="add-faq-btn"
            className="text-xs font-extrabold"
          >
            <Plus className="h-4 w-4" /> Add FAQ
          </Button>
        )}
      </div>

      {/* FAQ CONTENT */}
      <div>
        {loading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-16">
            <Spinner label="Loading FAQs…" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState
              title="No FAQs yet"
              hint="Add the questions visitors and delegations ask most."
            />
          </div>
        ) : (
          <>
            {/* MOBILE: CARD LIST */}
            <div className="grid gap-2.5 lg:hidden">
              {items.map((f) => (
                <div
                  key={f.id}
                  data-testid={`faq-card-${f.id}`}
                  className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500">#{f.sequence}</span>
                      <h3 className="font-heading font-bold text-white text-base">{f.question}</h3>
                    </div>
                    <Badge tone="blue" size="sm">
                      {f.category}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-300 font-body leading-relaxed line-clamp-3">
                    {f.answer}
                  </p>

                  <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px]">
                    {f.is_published ? (
                      <Badge tone="live" size="sm">
                        Published
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        Draft
                      </Badge>
                    )}
                  </div>

                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openEdit(f)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button variant="danger" size="sm" className="h-8 text-xs" onClick={() => remove(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* DESKTOP: TABLE */}
            <div className="hidden lg:block">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-16">Order</TH>
                    <TH>Question & Answer</TH>
                    <TH>Category</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((f) => (
                    <TR key={f.id} data-testid={`faq-row-${f.id}`}>
                      <TD className="text-slate-500 font-mono text-xs">{f.sequence}</TD>
                      <TD className="max-w-lg">
                        <div>
                          <p className="font-heading font-bold text-white text-sm">{f.question}</p>
                          <p className="text-xs text-slate-400 font-body line-clamp-2 mt-0.5">{f.answer}</p>
                        </div>
                      </TD>
                      <TD className="text-slate-300 font-body text-xs">{f.category}</TD>
                      <TD>
                        {f.is_published ? (
                          <Badge tone="live" size="sm">
                            Published
                          </Badge>
                        ) : (
                          <Badge tone="neutral" size="sm">
                            Draft
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(f)}
                              data-testid={`edit-faq-${f.id}`}
                              title="Edit FAQ"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-300" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => remove(f.id)}
                              data-testid={`delete-faq-${f.id}`}
                              title="Delete FAQ"
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
      </div>

      {/* ADD / EDIT FAQ DIALOG */}
      <Dialog open={open} onClose={() => setOpen(false)} title={editId ? "Edit FAQ" : "Add FAQ"} testId="faq-dialog">
        <div className="space-y-4">
          <div>
            <Label>Question *</Label>
            <Input
              value={form.question}
              onChange={(e) => set("question", e.target.value)}
              placeholder="e.g. What is the official match format and duration?"
              data-testid="faq-question-input"
            />
          </div>
          <div>
            <Label>Answer *</Label>
            <Textarea
              value={form.answer}
              onChange={(e) => set("answer", e.target.value)}
              placeholder="Answer text..."
              rows={4}
              data-testid="faq-answer-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="e.g. Rules, Logistics"
                data-testid="faq-category-input"
              />
            </div>
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={form.sequence}
                onChange={(e) => set("sequence", e.target.value)}
                data-testid="faq-sequence-input"
              />
            </div>
          </div>
          <div>
            <Label>Visibility</Label>
            <Select value={form.is_published} onChange={(e) => set("is_published", e.target.value)}>
              <option value="true">Published (visible on the public FAQ page)</option>
              <option value="false">Draft (hidden from the public)</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={save} data-testid="save-faq-btn">
              {editId ? "Update FAQ" : "Add FAQ"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* VISITOR SUBMITTED QUESTIONS */}
      <div className="border-t border-white/10 pt-6 space-y-4">
        <div>
          <h2 className="font-heading text-lg font-black tracking-tight text-white">Visitor Submitted Questions</h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 font-body">
            Questions asked from the public FAQ page's "Ask a question" form. Promote a good one into a real FAQ
            entry, or dismiss it.
          </p>
        </div>

        {questionsLoading ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 py-12">
            <Spinner label="Loading submitted questions…" />
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-obsidian-900 p-6">
            <EmptyState title="No questions submitted yet" hint="Visitor questions from the public FAQ page will show up here." />
          </div>
        ) : (
          <div className="grid gap-2.5">
            {questions.map((q) => (
              <div
                key={q.id}
                data-testid={`faq-question-${q.id}`}
                className="rounded-xl border border-white/10 bg-obsidian-900 p-4 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading font-bold text-white text-sm">{q.question}</p>
                    <p className="mt-1 text-[11px] text-slate-400 font-body">
                      {q.name || "Anonymous"}
                      {q.email ? ` · ${q.email}` : ""} · {new Date(q.created_at).toLocaleString()}
                    </p>
                  </div>
                  {q.status === "new" && (
                    <Badge tone="amber" size="sm">
                      New
                    </Badge>
                  )}
                  {q.status === "promoted" && (
                    <Badge tone="green" size="sm">
                      Promoted
                    </Badge>
                  )}
                  {q.status === "dismissed" && (
                    <Badge tone="neutral" size="sm">
                      Dismissed
                    </Badge>
                  )}
                </div>

                {canEdit && q.status === "new" && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
                    <Button variant="gold" size="sm" className="h-8 text-xs" onClick={() => openPromote(q)} data-testid={`promote-question-${q.id}`}>
                      Promote to FAQ
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => dismissQuestion(q.id)} data-testid={`dismiss-question-${q.id}`}>
                      Dismiss
                    </Button>
                  </div>
                )}
                {canEdit && q.status !== "new" && (
                  <div className="flex justify-end border-t border-white/10 pt-2.5">
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-red-400" onClick={() => deleteQuestion(q.id)} data-testid={`delete-question-${q.id}`}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PROMOTE QUESTION DIALOG */}
      <Dialog open={!!promoteTarget} onClose={() => setPromoteTarget(null)} title="Promote to FAQ" testId="promote-question-dialog">
        <div className="space-y-4">
          <div>
            <Label>Question</Label>
            <p className="text-sm text-white font-body">{promoteTarget?.question}</p>
          </div>
          <div>
            <Label>Answer *</Label>
            <Textarea
              value={promoteForm.answer}
              onChange={(e) => setPromoteForm((f) => ({ ...f, answer: e.target.value }))}
              placeholder="Answer text..."
              rows={4}
              data-testid="promote-answer-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input
                value={promoteForm.category}
                onChange={(e) => setPromoteForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Rules, Logistics"
              />
            </div>
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={promoteForm.sequence}
                onChange={(e) => setPromoteForm((f) => ({ ...f, sequence: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Visibility</Label>
            <Select
              value={promoteForm.is_published}
              onChange={(e) => setPromoteForm((f) => ({ ...f, is_published: e.target.value }))}
            >
              <option value="true">Published (visible on the public FAQ page)</option>
              <option value="false">Draft (hidden from the public)</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <Button variant="outline" size="sm" onClick={() => setPromoteTarget(null)}>
              Cancel
            </Button>
            <Button variant="gold" size="sm" onClick={submitPromote} data-testid="save-promote-btn">
              Promote
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
