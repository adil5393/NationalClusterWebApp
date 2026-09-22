import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";

/** Full-screen state shown while the session is being confirmed. Never
 * implies the user is logged out — on connection trouble it offers Retry. */
export function AuthSplash({ unreachable, onRetry }: { unreachable: boolean; onRetry: () => void }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-obsidian px-6 text-center text-slate-200"
      data-testid="auth-splash"
    >
      <img src="/icon-192.png" alt="" className="h-16 w-16 rounded-2xl object-contain" />
      {unreachable ? (
        <>
          <p className="text-sm text-slate-300">Can't reach the server right now. Your session is still saved.</p>
          <Button onClick={onRetry} data-testid="auth-retry-btn">
            Retry
          </Button>
        </>
      ) : (
        <Spinner label="Verifying tournament operations session…" />
      )}
    </div>
  );
}
