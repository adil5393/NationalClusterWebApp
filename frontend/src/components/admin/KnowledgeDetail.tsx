import { useEffect, useState } from "react";
import { Trash2, Send, Paperclip, Upload, Link2, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";

const BACKEND = import.meta.env.REACT_APP_BACKEND_URL ?? "";

interface KItem { id: number; title: string; decision?: string; reason?: string }
interface Comment { id: number; author: string; body: string; created_at?: string }
interface Doc { id: number; title: string; is_upload: boolean; external_url?: string | null; file_name?: string; size_bytes?: number }

export function KnowledgeDetail({ itemId, onClose }: { itemId: number | null; onClose: () => void }) {
  const [item, setItem] = useState<KItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [comment, setComment] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = () => {
    if (!itemId) return;
    Promise.all([
      api.get(`/knowledge/${itemId}`),
      api.get(`/knowledge/${itemId}/comments`),
      api.get(`/knowledge/${itemId}/documents`),
    ]).then(([i, c, d]) => { setItem(i.data); setComments(c.data); setDocs(d.data); });
  };
  useEffect(() => { if (itemId) { setComment(""); setDocTitle(""); setDocUrl(""); setFile(null); load(); } }, [itemId]);

  const addComment = async () => {
    if (!comment.trim()) return;
    await api.post(`/knowledge/${itemId}/comments`, { body: comment, author: "Organizer" });
    setComment("");
    load();
  };
  const delComment = async (id: number) => { await api.delete(`/comments/${id}`); load(); };

  const addDoc = async () => {
    if (!docTitle.trim()) return toast.error("Document title is required");
    if (!file && !docUrl.trim()) return toast.error("Attach a file or paste a link");
    const fd = new FormData();
    fd.append("title", docTitle);
    fd.append("knowledge_item_id", String(itemId));
    if (file) fd.append("file", file);
    else fd.append("external_url", docUrl);
    try {
      await api.post("/documents", fd, { headers: { "Content-Type": undefined } as any });
      toast.success("Attachment added");
      setDocTitle(""); setDocUrl(""); setFile(null);
      load();
    } catch {
      toast.error("Could not add attachment");
    }
  };
  const delDoc = async (id: number) => { await api.delete(`/documents/${id}`); load(); };

  return (
    <Dialog open={!!itemId} onClose={onClose} title={item?.title ?? "Decision"} className="max-w-2xl" testId="knowledge-detail">
      {!item ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          {item.decision && (
            <div className="rounded-md border-l-2 border-coral bg-orange-50/60 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-coral-600">Decision</p>
              <p className="text-sm font-semibold text-slate-800">{item.decision}</p>
            </div>
          )}
          {item.reason && (
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason / Why</p>
              <p className="text-sm text-slate-700">{item.reason}</p>
            </div>
          )}

          {/* Documents */}
          <div>
            <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-slate-900"><Paperclip className="h-4 w-4" /> Attachments &amp; Quotes</h4>
            <div className="mt-3 space-y-2" data-testid="knowledge-documents">
              {docs.length === 0 && <p className="text-sm text-slate-400">No attachments yet.</p>}
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2" data-testid={`document-${d.id}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate text-sm font-semibold text-slate-800">{d.title}</span>
                    <Badge tone={d.is_upload ? "green" : "blue"}>{d.is_upload ? "File" : "Link"}</Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={d.is_upload ? `${BACKEND}/api/documents/${d.id}/download` : d.external_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
                      data-testid={`open-document-${d.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <Button variant="ghost" size="icon" onClick={() => delDoc(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
              <div><Label>Attachment title</Label><Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Supplier quote — Mattresses" data-testid="doc-title-input" /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Upload file (PDF/Excel)</Label>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 text-sm text-slate-500 hover:border-coral">
                    <Upload className="h-4 w-4" /> {file ? file.name : "Choose file…"}
                    <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="doc-file-input" />
                  </label>
                </div>
                <div>
                  <Label>…or paste a link</Label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://…" className="pl-8" data-testid="doc-url-input" />
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={addDoc} data-testid="add-document-btn"><Paperclip className="h-4 w-4" /> Add attachment</Button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <h4 className="font-heading text-sm font-bold text-slate-900">Discussion</h4>
            <div className="mt-3 space-y-2" data-testid="knowledge-comments">
              {comments.length === 0 && <p className="text-sm text-slate-400">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="group rounded-md bg-slate-50 px-3 py-2" data-testid={`comment-${c.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">{c.author}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{formatDate(c.created_at)}</span>
                      <button onClick={() => delComment(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note or discussion point…" className="min-h-[44px]" data-testid="comment-input" />
              <Button onClick={addComment} data-testid="add-comment-btn"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
