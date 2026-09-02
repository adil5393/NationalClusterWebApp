import { useEffect, useState } from "react";
import { Trash2, Send, Paperclip, Upload, Link2, Download, FileText, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { api, BASE_URL } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/meta";

const BACKEND = BASE_URL;

interface KItem {
  id: number;
  title: string;
  decision?: string;
  reason?: string;
}
interface Comment {
  id: number;
  author: string;
  body: string;
  created_at?: string;
}
interface Doc {
  id: number;
  title: string;
  is_upload: boolean;
  external_url?: string | null;
  file_name?: string;
  size_bytes?: number;
}

export function KnowledgeDetail({
  itemId,
  onClose,
}: {
  itemId: number | null;
  onClose: () => void;
}) {
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
    ]).then(([i, c, d]) => {
      setItem(i.data);
      setComments(c.data);
      setDocs(d.data);
    });
  };

  useEffect(() => {
    if (itemId) {
      setComment("");
      setDocTitle("");
      setDocUrl("");
      setFile(null);
      load();
    }
  }, [itemId]);

  const addComment = async () => {
    if (!comment.trim()) return;
    await api.post(`/knowledge/${itemId}/comments`, { body: comment, author: "Organizer" });
    setComment("");
    load();
  };

  const delComment = async (id: number) => {
    await api.delete(`/comments/${id}`);
    load();
  };

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
      setDocTitle("");
      setDocUrl("");
      setFile(null);
      load();
    } catch {
      toast.error("Could not add attachment");
    }
  };

  const delDoc = async (id: number) => {
    await api.delete(`/documents/${id}`);
    load();
  };

  return (
    <Dialog
      open={!!itemId}
      onClose={onClose}
      title={item?.title ?? "Decision Details"}
      className="max-w-2xl"
      testId="knowledge-detail"
    >
      {!item ? (
        <p className="text-xs text-slate-400 py-6 text-center">Loading decision details…</p>
      ) : (
        <div className="space-y-6">
          {item.decision && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 p-3.5 space-y-1">
              <p className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-gold">
                Official Ruling / Decision
              </p>
              <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                {item.decision}
              </p>
            </div>
          )}

          {item.reason && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1">
              <p className="text-[10px] font-heading font-bold uppercase tracking-widest text-slate-400">
                Reasoning & Supporting Context
              </p>
              <p className="text-xs text-slate-300 font-body leading-relaxed">{item.reason}</p>
            </div>
          )}

          {/* ATTACHMENTS */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-white">
              <Paperclip className="h-4 w-4 text-gold" /> Attachments, Quotes & Evidence ({docs.length})
            </h4>

            <div className="space-y-2" data-testid="knowledge-documents">
              {docs.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No attachments uploaded yet.</p>
              ) : (
                docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-obsidian-950 p-2.5 text-xs"
                    data-testid={`document-${d.id}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-gold" />
                      <span className="truncate font-semibold text-white">{d.title}</span>
                      <Badge tone={d.is_upload ? "green" : "blue"} size="sm">
                        {d.is_upload ? "File" : "Link"}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={
                          d.is_upload
                            ? `${BACKEND}/api/documents/${d.id}/download`
                            : d.external_url ?? "#"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10 transition-colors"
                        data-testid={`open-document-${d.id}`}
                      >
                        <Download className="h-4 w-4 text-gold" />
                      </a>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => delDoc(d.id)}
                        title="Delete Document"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-obsidian-950 p-3.5 space-y-3">
              <div>
                <Label>Attachment Title *</Label>
                <Input
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Supplier quotation quote — Mats"
                  className="h-8 text-xs"
                  data-testid="doc-title-input"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Upload File (PDF / Excel / Image)</Label>
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/15 bg-white/5 px-3 text-xs text-slate-400 hover:border-gold hover:text-white transition-colors">
                    <Upload className="h-3.5 w-3.5 text-gold" />{" "}
                    <span className="truncate">{file ? file.name : "Choose file…"}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      data-testid="doc-file-input"
                    />
                  </label>
                </div>
                <div>
                  <Label>…or External Link</Label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      placeholder="https://…"
                      className="pl-8 h-9 text-xs"
                      data-testid="doc-url-input"
                    />
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addDoc}
                data-testid="add-document-btn"
                className="text-xs font-bold"
              >
                <Paperclip className="h-3.5 w-3.5 text-gold" /> Attach File / Link
              </Button>
            </div>
          </div>

          {/* DISCUSSION / COMMENTS */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-heading text-sm font-bold text-white">
              <MessageSquare className="h-4 w-4 text-gold" /> Discussion & Deliberation ({comments.length})
            </h4>

            <div className="space-y-2" data-testid="knowledge-comments">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No discussion notes added yet.</p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-white/5 bg-obsidian-950 p-3 space-y-1"
                    data-testid={`comment-${c.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-heading font-bold text-gold">{c.author}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {formatDate(c.created_at)}
                        </span>
                        <button
                          onClick={() => delComment(c.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 font-body leading-relaxed">{c.body}</p>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a deliberation point or follow-up note…"
                className="min-h-[44px] text-xs flex-1"
                data-testid="comment-input"
              />
              <Button
                variant="gold"
                onClick={addComment}
                data-testid="add-comment-btn"
                className="h-auto px-4"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
