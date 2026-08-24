// Thin reconnecting WebSocket client for the live-match feed (see backend
// app/ws.py + routers/live_ws.py). Read-only: we never send anything over
// these sockets, only receive match_* events broadcast after a REST mutation.

function wsUrl(path: string): string {
  const base = (import.meta.env.REACT_APP_BACKEND_URL as string) || window.location.origin;
  return base.replace(/^http/, "ws") + path;
}

export interface MatchLiveEvent {
  event: string;
  match_id: number;
  tournament_id: number;
  round_id: number;
  status: string;
  team_a_id: number | null;
  team_b_id: number | null;
  team_a_score: number;
  team_b_score: number;
  winner_team_id: number | null;
}

/** Connects to a live channel and auto-reconnects (capped backoff) until the
 * returned cleanup function is called. Returns that cleanup function. */
export function connectLive(path: string, onMessage: (data: MatchLiveEvent) => void): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (stopped) return;
    ws = new WebSocket(wsUrl(path));
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onopen = () => {
      attempt = 0;
    };
    ws.onclose = () => {
      if (stopped) return;
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      attempt += 1;
      retryTimer = setTimeout(open, delay);
    };
  };
  open();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}

export function matchChannel(matchId: number) {
  return `/ws/matches/${matchId}`;
}

export function tournamentChannel(tournamentId: number) {
  return `/ws/tournaments/${tournamentId}`;
}
