import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
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
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-5" data-testid="admin-login">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2.5">
          <span className="grid h-12 w-12 place-items-center rounded-md bg-coral font-heading text-lg font-black text-white">CN</span>
          <div className="text-center leading-none">
            <span className="block font-heading text-lg font-extrabold text-white">Operations</span>
            <span className="block text-[11px] font-semibold tracking-widest text-slate-500">2026–27</span>
          </div>
        </div>

        <form onSubmit={submit} className="mt-8 rounded-lg border border-white/10 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-2 text-slate-950">
            <Lock className="h-4 w-4" />
            <h1 className="font-heading text-lg font-bold">Organizer Portal</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">Log in with your organizer account.</p>

          <div className="mt-5">
            <Label>Username</Label>
            <Input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="login-username-input"
            />
          </div>
          <div className="mt-4">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password-input"
            />
          </div>

          <Button type="submit" disabled={loading} className="mt-5 w-full" data-testid="login-submit-btn">
            {loading ? "Checking…" : "Log In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
