import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setSessionExpiredHandler } from "@/lib/api";
import type { Me } from "@/lib/permissions";

// idle: nobody has asked yet (public pages never hit /auth/me)
// loading: confirming the session with the server (includes transient failures)
// authenticated / unauthenticated: the SERVER said so — nothing else moves us here.
export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  /** True once automatic retries are exhausted while the server is unreachable. */
  unreachable: boolean;
  /** Start the bootstrap check if it hasn't run yet. Safe to call repeatedly. */
  ensure: () => void;
  /** Manual retry after `unreachable`; never touches the stored session. */
  retry: () => void;
  /** Adopt the payload returned by POST /auth/login. */
  setSession: (me: Me) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Android can report "no network" for a few seconds after resume/cold start.
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000];
const REQUEST_TIMEOUT_MS = 10000;

type Verdict = "authenticated" | "unauthenticated" | "unreachable";

/** Asks the server. Only an explicit answer counts: network errors, timeouts
 * and 5xx are "unreachable" and must never be treated as being logged out. */
async function checkSession(): Promise<{ verdict: Verdict; me?: Me }> {
  try {
    const r = await api.get<Me>("/auth/me", { timeout: REQUEST_TIMEOUT_MS });
    return r.data.authenticated ? { verdict: "authenticated", me: r.data } : { verdict: "unauthenticated" };
  } catch (e: any) {
    if (e?.response?.status === 401) return { verdict: "unauthenticated" };
    return { verdict: "unreachable" };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [me, setMe] = useState<Me | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const statusRef = useRef<AuthStatus>("idle");
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const update = useCallback((s: AuthStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const apply = useCallback(
    (res: { verdict: Verdict; me?: Me }) => {
      if (res.verdict === "authenticated") {
        setMe(res.me!);
        setUnreachable(false);
        update("authenticated");
      } else if (res.verdict === "unauthenticated") {
        setMe(null);
        setUnreachable(false);
        update("unauthenticated");
      }
    },
    [update],
  );

  // Initial confirmation: retry transient failures with backoff, then wait for
  // a manual Retry — the stored session is never cleared along the way.
  const bootstrap = useCallback(
    async (attempt = 0) => {
      if (unmounted.current) return;
      running.current = true;
      if (statusRef.current !== "authenticated") update("loading");
      const res = await checkSession();
      if (unmounted.current) return;
      if (res.verdict !== "unreachable") {
        running.current = false;
        apply(res);
        return;
      }
      if (attempt < RETRY_DELAYS_MS.length) {
        timer.current = setTimeout(() => bootstrap(attempt + 1), RETRY_DELAYS_MS[attempt]);
      } else {
        running.current = false;
        setUnreachable(true);
      }
    },
    [apply, update],
  );

  const ensure = useCallback(() => {
    if (statusRef.current === "idle") bootstrap();
  }, [bootstrap]);

  const retry = useCallback(() => {
    clearTimer();
    setUnreachable(false);
    bootstrap();
  }, [bootstrap]);

  const setSession = useCallback(
    (m: Me) => {
      clearTimer();
      running.current = false;
      setMe(m);
      setUnreachable(false);
      update("authenticated");
    },
    [update],
  );

  const logout = useCallback(async () => {
    // Throws when unreachable: the server session would still be alive, so
    // we must not pretend the user is logged out.
    await api.post("/auth/logout");
    clearTimer();
    setMe(null);
    update("unauthenticated");
  }, [update]);

  // The server rejected an API call as "Not authenticated" mid-session.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearTimer();
      running.current = false;
      setMe(null);
      update("unauthenticated");
    });
    return () => setSessionExpiredHandler(null);
  }, [update]);

  // Returning from background / regaining connectivity: quietly re-validate.
  // A failed re-check leaves the current session and screen exactly as they are.
  useEffect(() => {
    const revalidate = async () => {
      const s = statusRef.current;
      if (s === "loading") {
        if (!running.current) retry();
        return;
      }
      if (s !== "authenticated") return;
      const res = await checkSession();
      if (!unmounted.current && res.verdict !== "unreachable") apply(res);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", revalidate);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", revalidate);
    };
  }, [apply, retry]);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      clearTimer();
    };
  }, []);

  const value = useMemo(
    () => ({ status, me, unreachable, ensure, retry, setSession, logout }),
    [status, me, unreachable, ensure, retry, setSession, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
