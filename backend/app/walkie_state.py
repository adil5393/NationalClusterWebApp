"""In-memory, single-worker state for the Walkie-Talkie feature: which
connections are listening on which channel, and who currently holds the
floor. Same "no Redis needed, single uvicorn worker" reasoning already
established by ws.py's _Hub for match-live updates — nothing here is
queried outside this process, and nothing here is ever persisted (see
migrations/versions/e7c2a94f1d3b's docstring): a server restart simply
clears every channel back to idle, which is the correct, desired behavior
for live PTT state rather than something that needs recovering.

Not reusing ws.py's _Hub directly: that hub is a plain fan-out (channel ->
set of sockets, one-way broadcast), whereas a walkie room needs per-
connection identity (who is this, are they the current speaker) and
floor-control state alongside the socket set — different enough shape that
forcing it through _Hub's API would fight it rather than reuse it.
"""
import asyncio
import secrets
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

# How long a single PTT press may hold the floor before the server forces a
# release — a real press-and-hold transmission runs seconds, not minutes,
# so this is purely a dead-man safety net for a client that never sends
# release_floor (crash, dropped release frame, stuck button). Configurable
# constant, not a magic number scattered through the handler.
MAX_FLOOR_SECONDS = 30
# Frontend-facing heads-up before the hard cutoff (see WalkieTalkie.tsx) —
# not enforced here, just kept alongside the value it's relative to.
FLOOR_WARNING_SECONDS = 25


@dataclass
class Connection:
    connection_id: str
    user_id: int
    name: str
    is_admin: bool
    can_transmit: bool
    websocket: WebSocket


@dataclass
class ChannelRoom:
    connections: dict[str, Connection] = field(default_factory=dict)
    speaker_connection_id: "str | None" = None
    floor_task: "asyncio.Task | None" = None
    floor_taken_at: "float | None" = None

    def listener_ids(self, exclude: "str | None" = None) -> list[str]:
        return [cid for cid in self.connections if cid != exclude]


class WalkieState:
    def __init__(self) -> None:
        self._rooms: dict[str, ChannelRoom] = {}

    def room(self, channel_key: str) -> ChannelRoom:
        return self._rooms.setdefault(channel_key, ChannelRoom())

    @staticmethod
    def new_connection_id() -> str:
        # Server-assigned and unguessable — the frontend never invents or
        # supplies its own connection id (see routers/walkie.py's signaling
        # relay, which only ever routes to ids the server itself handed out).
        return secrets.token_urlsafe(12)

    @staticmethod
    def now() -> float:
        return time.monotonic()


state = WalkieState()
