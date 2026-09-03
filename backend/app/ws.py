"""In-memory pub/sub for live match updates. Single uvicorn worker (see
Dockerfile/server.py), so an in-process dict is sufficient — no Redis needed.

Channels:
  - /ws/matches/{match_id}      — one match's own score/status stream (the
    organizer's live console and a spectator's single-match view both use this).
  - /ws/tournaments/{tournament_id} — every match transition in that tournament,
    coarse-grained, for a bracket page to know when to re-fetch/update itself.
  - /ws/roster — one global channel for team/participant eligibility changes
    (Team.is_active, TeamInactiveAgeGroup, Participant.is_present) — purely a
    convenience nudge so the Fixture creation window (Matches.tsx's Generate
    Bracket dialog) reflects another organizer's roster edits without a
    manual reload, same idea as the match channels but not scoped to any one
    match/tournament since eligibility isn't either.

Connections are read-only fan-out: nothing sent by a client is processed, so
these endpoints intentionally carry no auth — mutating a match always goes
through the authenticated REST endpoints in routers/matches.py, which then
broadcast here. See security.py for why mutation is safe without gating this.
"""
import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger("cluster.ws")


class _Hub:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, channel: str, ws: WebSocket) -> None:
        await ws.accept()
        self._channels[channel].add(ws)

    def disconnect(self, channel: str, ws: WebSocket) -> None:
        self._channels[channel].discard(ws)
        if not self._channels[channel]:
            self._channels.pop(channel, None)

    async def broadcast(self, channel: str, payload: dict) -> None:
        dead = []
        for ws in self._channels.get(channel, ()):
            try:
                await ws.send_json(payload)
            except Exception:  # noqa: BLE001 — connection dropped mid-send
                dead.append(ws)
        for ws in dead:
            self.disconnect(channel, ws)


hub = _Hub()


def match_channel(match_id: int) -> str:
    return f"match:{match_id}"


def tournament_channel(tournament_id: int) -> str:
    return f"tournament:{tournament_id}"


ROSTER_CHANNEL = "roster"


async def broadcast_roster_change(event_type: str) -> None:
    """Nudge anything subscribed to /ws/roster to re-fetch — no payload
    beyond the event name; unlike a match event there's no single row whose
    state is worth shipping over the wire, the listener just refetches
    teams/participants wholesale (same "ignore the payload, just reload"
    pattern Live.tsx already uses for the tournament channel)."""
    await hub.broadcast(ROSTER_CHANNEL, {"event": event_type})


def broadcast_roster_change_sync(event_type: str) -> None:
    """Sync/threadpooled-endpoint counterpart to broadcast_roster_change,
    mirroring broadcast_match_event_sync exactly."""
    try:
        asyncio.run(broadcast_roster_change(event_type))
    except Exception:  # noqa: BLE001
        logger.exception("Roster broadcast failed for event %s", event_type)


async def broadcast_match_event(match, event_type: str) -> None:
    """Publish a match's current state to both its own channel and its
    tournament's channel. `match` is a models.Match ORM instance."""
    payload = {
        "event": event_type,
        "match_id": match.id,
        "tournament_id": match.tournament_id,
        "round_id": match.round_id,
        "status": match.status,
        "team_a_id": match.team_a_id,
        "team_b_id": match.team_b_id,
        "team_a_score": match.team_a_score,
        "team_b_score": match.team_b_score,
        "winner_team_id": match.winner_team_id,
    }
    await hub.broadcast(match_channel(match.id), payload)
    await hub.broadcast(tournament_channel(match.tournament_id), payload)


def broadcast_match_event_sync(match, event_type: str) -> None:
    """Fire-and-forget helper for the (plain sync, threadpooled) REST endpoints
    in routers/matches.py. Runs in a fresh event loop in the calling thread —
    safe because Starlette executes sync path functions off the main loop's
    thread. Never let a broadcast failure fail the request that already
    committed the underlying score change."""
    try:
        asyncio.run(broadcast_match_event(match, event_type))
    except Exception:  # noqa: BLE001
        logger.exception("Live broadcast failed for match %s", getattr(match, "id", "?"))
