"""Read-only WebSocket endpoints for live match updates. Intentionally
un-gated (see ws.py docstring) — mounted directly in main.py alongside
health/public/auth, not through the per-module admin router loop."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..ws import ROSTER_CHANNEL, hub, match_channel, tournament_channel

router = APIRouter(tags=["live"])


@router.websocket("/ws/matches/{match_id}")
async def ws_match(websocket: WebSocket, match_id: int):
    channel = match_channel(match_id)
    await hub.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()  # clients don't send anything meaningful; just block here
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(channel, websocket)


@router.websocket("/ws/tournaments/{tournament_id}")
async def ws_tournament(websocket: WebSocket, tournament_id: int):
    channel = tournament_channel(tournament_id)
    await hub.connect(channel, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(channel, websocket)


@router.websocket("/ws/roster")
async def ws_roster(websocket: WebSocket):
    await hub.connect(ROSTER_CHANNEL, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ROSTER_CHANNEL, websocket)
