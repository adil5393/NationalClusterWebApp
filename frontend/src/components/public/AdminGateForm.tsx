import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// Inline "type an admin password to unlock" panel reused by the public
// Teams directory and the Live match-roster dialog — see backend
// routers/public.py's _require_gate_password. Not a login: no username, any
// active admin account's password works, and nothing is remembered — both
// callers re-prompt on every fresh load of that section.
export function AdminGateForm({
  onSubmit,
  busy,
  error,
  compact,
}: {
  onSubmit: (password: string) => void;
  busy?: boolean;
  error?: string | null;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <form
      onSubmit={submit}
      data-testid="admin-gate-form"
      className={cn(
        "mx-auto w-full max-w-sm space-y-3 rounded-xl border border-white/10 bg-obsidian-900 text-center",
        compact ? "p-5" : "p-8",
      )}
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
        <Lock className="h-5 w-5 text-gold" />
      </div>
      <h2 className="font-heading text-base font-bold text-white">Admin Access Required</h2>
      <p className="text-xs text-slate-400 font-body leading-relaxed">
        This shows participant names and squad counts, so it's restricted to tournament organizers.
        Enter an admin password to continue.
      </p>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Admin password"
        autoFocus
        data-testid="admin-gate-password-input"
        className="h-10 w-full rounded-lg border border-white/15 bg-obsidian-950 px-3 text-sm text-white placeholder:text-slate-500 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !value.trim()}
        data-testid="admin-gate-submit-btn"
        className="h-10 w-full rounded-lg bg-gold text-xs font-heading font-extrabold uppercase tracking-wide text-obsidian transition-colors hover:bg-gold-400 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
