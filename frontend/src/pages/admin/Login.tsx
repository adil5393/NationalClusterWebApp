import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Trophy, ArrowLeft, Shield } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      await api.post("/auth/login", { username, password });
      navigate("/admin");
    } catch (e: any) {
      if (e?.response) {
        // Server actually answered — this is a real credential/validation rejection.
        toast.error(e.response.data?.detail ?? "Incorrect username or password");
      } else if (e?.request) {
        // Request went out but got no response — network/DNS/CORS failure, not bad
        // credentials. Reporting this as "incorrect password" would be misleading.
        toast.error("Could not reach the server. Check your internet connection and try again.");
      } else {
        toast.error(e?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-obsidian bg-kabaddi-court px-5 py-12 selection:bg-gold selection:text-obsidian"
      data-testid="admin-login"
    >
      <div className="w-full max-w-md">
        {/* BRAND EMBLEM */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative grid h-14 w-14 place-items-center rounded-xl border border-gold/40 bg-gradient-to-br from-gold/20 via-obsidian-900 to-obsidian text-gold shadow-[0_0_25px_-5px_rgba(245,158,11,0.35)]">
            <Trophy className="h-7 w-7 text-gold" />
          </div>
          <div className="text-center leading-tight">
            <div className="flex items-center justify-center gap-1.5">
              <span className="font-heading text-lg font-black tracking-tight text-white">
                CBSE NATIONAL KABADDI
              </span>
            </div>
            <span className="block text-xs font-heading font-extrabold tracking-widest text-gold mt-0.5">
              OPERATIONS CENTER · 2026–27
            </span>
          </div>
        </div>

        {/* LOGIN FORM CARD */}
        <form
          onSubmit={submit}
          className="mt-8 rounded-xl border border-white/10 bg-obsidian-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-2.5 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold border border-gold/30">
              <Lock className="h-4 w-4 text-gold" />
            </span>
            <div>
              <h1 className="font-heading text-lg font-bold tracking-tight">Organizer Sign In</h1>
              <p className="text-xs text-slate-400 font-body">
                Authorized tournament staff & officials only
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <Label>Username</Label>
              <Input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter officer username"
                data-testid="login-username-input"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Password</Label>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                data-testid="login-password-input"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            variant="gold"
            className="mt-6 w-full h-11 text-sm font-black tracking-wide shadow-gold-glow/30"
            data-testid="login-submit-btn"
          >
            {loading ? "Authenticating Session…" : "Enter Operations Center"}
          </Button>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-gold transition-colors font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Return to Public Site
            </Link>
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Shield className="h-3 w-3 text-gold" /> Encrypted Session
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
