"""Walkie-Talkie channel catalog + (added in Phase B) WebSocket PTT
signaling. Operational comms for authenticated Organizer Portal / Capacitor
staff accounts only — never exposed on the public site, and never gated by
a schemas.ORGANIZER_MODULES permission: like Staff Live Map's own location
reporting, this is a tool every staff account should be able to open, with
access controlled per-channel instead (see _can_transmit below).

No audio is ever stored: everything here only relays connection ids and
floor-control/presence messages; actual voice moves peer-to-peer over
WebRTC, never through this server."""
import asyncio
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal, get_db
from ..security import require_auth
from ..walkie_state import MAX_FLOOR_SECONDS, ChannelRoom, Connection, state

router = APIRouter(prefix="/api/walkie", tags=["walkie"])
logger = logging.getLogger("cluster.walkie")


def _can_transmit(current: models.OrganizerUser, channel: models.WalkieChannel, db: Session) -> bool:
    """Admins can always transmit anywhere. Every channel except a
    transmit_restricted one (currently just "All Staff") is open to any
    authenticated account. A transmit_restricted channel additionally needs
    an explicit WalkieChannelTransmitPermission row."""
    if current.is_admin:
        return True
    if not channel.transmit_restricted:
        return True
    return (
        db.query(models.WalkieChannelTransmitPermission)
        .filter_by(channel_id=channel.id, organizer_user_id=current.id)
        .first()
        is not None
    )


@router.get("/channels")
def list_channels(current: models.OrganizerUser = Depends(require_auth), db: Session = Depends(get_db)):
    """Every active channel this account may open — listening is universal
    (any authenticated organizer account) in V1, so the only per-account
    variable worth telling the frontend up front is whether the PTT button
    should even be enabled (can_transmit); the frontend hiding/disabling it
    is UX only, the WebSocket layer re-checks this server-side regardless."""
    channels = (
        db.query(models.WalkieChannel)
        .filter(models.WalkieChannel.is_active.is_(True))
        .order_by(models.WalkieChannel.id)
        .all()
    )
    return [
        {
            "key": c.key,
            "name": c.name,
            "icon": c.icon,
            "transmit_restricted": c.transmit_restricted,
            "can_transmit": _can_transmit(current, c, db),
        }
        for c in channels
    ]


async def _send(ws: WebSocket, payload: dict) -> None:
    try:
        await ws.send_json(payload)
    except Exception:  # noqa: BLE001 — socket already gone; caller's own receive loop will clean it up
        pass


async def _broadcast(room: ChannelRoom, payload: dict, exclude: "str | None" = None) -> None:
    for cid, conn in list(room.connections.items()):
        if cid != exclude:
            await _send(conn.websocket, payload)


async def _broadcast_presence(room: ChannelRoom) -> None:
    await _broadcast(room, {"type": "presence", "count": len(room.connections)})


async def _release_floor(room: ChannelRoom, *, reason: str = "released") -> None:
    """Server-authoritative floor release — the only place speaker_stopped
    is ever broadcast from, whether triggered by an explicit release_floor
    message, a disconnect, or the MAX_FLOOR_SECONDS dead-man timeout."""
    if room.speaker_connection_id is None:
        return
    if room.floor_task is not None:
        room.floor_task.cancel()
        room.floor_task = None
    room.speaker_connection_id = None
    room.floor_taken_at = None
    await _broadcast(room, {"type": "speaker_stopped", "reason": reason})


async def _floor_timeout(room: ChannelRoom, connection_id: str) -> None:
    try:
        await asyncio.sleep(MAX_FLOOR_SECONDS)
    except asyncio.CancelledError:
        return
    if room.speaker_connection_id == connection_id:
        logger.info("walkie: forcing floor release after %ss timeout", MAX_FLOOR_SECONDS)
        await _release_floor(room, reason="timeout")


@router.websocket("/ws/{channel_key}")
async def ws_walkie(websocket: WebSocket, channel_key: str):
    # Auth and channel-lookup happen on a short-lived session — this
    # connection may stay open for a long time, and a DB session has no
    # business living that long. Every later per-message permission check
    # (request_floor) opens its own short-lived session the same way.
    db = SessionLocal()
    try:
        user_id = websocket.session.get("user_id")
        current = db.get(models.OrganizerUser, user_id) if user_id else None
        if not current or not current.is_active:
            await websocket.close(code=4401)
            return
        channel = db.query(models.WalkieChannel).filter_by(key=channel_key, is_active=True).first()
        if not channel:
            await websocket.close(code=4404)
            return
        can_transmit = _can_transmit(current, channel, db)
        name = current.full_name or current.username
        is_admin = current.is_admin
    finally:
        db.close()

    await websocket.accept()
    connection_id = state.new_connection_id()
    conn = Connection(
        connection_id=connection_id,
        user_id=user_id,
        name=name,
        is_admin=is_admin,
        can_transmit=can_transmit,
        websocket=websocket,
    )
    room = state.room(channel_key)
    room.connections[connection_id] = conn

    await _send(
        websocket,
        {
            "type": "connected",
            "connection_id": connection_id,
            "name": name,
            "is_admin": is_admin,
            "can_transmit": can_transmit,
            "listener_count": len(room.connections),
            "speaking": (
                room.connections[room.speaker_connection_id].name
                if room.speaker_connection_id and room.speaker_connection_id in room.connections
                else None
            ),
            "max_floor_seconds": MAX_FLOOR_SECONDS,
        },
    )
    # A join mid-transmission needs its own signal (not just the presence
    # count) so the current speaker's mesh can open one more outgoing peer —
    # otherwise anyone joining after PTT was already held down never hears
    # anything until the next press.
    if room.speaker_connection_id and room.speaker_connection_id != connection_id:
        speaker_conn = room.connections.get(room.speaker_connection_id)
        if speaker_conn:
            await _send(speaker_conn.websocket, {"type": "listener_joined", "connection_id": connection_id})
    await _broadcast_presence(room)

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type == "request_floor":
                if not can_transmit:
                    await _send(websocket, {"type": "floor_denied", "reason": "forbidden"})
                    continue
                if room.speaker_connection_id is not None and room.speaker_connection_id != connection_id:
                    speaker = room.connections.get(room.speaker_connection_id)
                    await _send(
                        websocket,
                        {"type": "floor_denied", "reason": "busy", "speaker_name": speaker.name if speaker else None},
                    )
                    continue
                room.speaker_connection_id = connection_id
                room.floor_taken_at = state.now()
                room.floor_task = asyncio.create_task(_floor_timeout(room, connection_id))
                await _send(
                    websocket,
                    {
                        "type": "floor_granted",
                        "listeners": room.listener_ids(exclude=connection_id),
                        "max_seconds": MAX_FLOOR_SECONDS,
                    },
                )
                await _broadcast(room, {"type": "speaker_started", "name": name}, exclude=connection_id)

            elif msg_type == "release_floor":
                if room.speaker_connection_id == connection_id:
                    await _release_floor(room)

            elif msg_type in ("webrtc_offer", "webrtc_answer", "webrtc_ice"):
                target_id = msg.get("to")
                target = room.connections.get(target_id) if target_id else None
                if not target:
                    continue  # unknown/expired connection — silently drop, never a generic relay
                # Only the current speaker may originate offers; answers/ICE
                # from a listener may only go back to the current speaker.
                # Prevents this endpoint being used as an arbitrary signaling
                # relay between two unrelated, non-speaking connections.
                if msg_type == "webrtc_offer" and connection_id != room.speaker_connection_id:
                    continue
                if msg_type == "webrtc_answer" and target_id != room.speaker_connection_id:
                    continue
                relay = {"type": msg_type, "from": connection_id}
                if "sdp" in msg:
                    relay["sdp"] = msg["sdp"]
                if "candidate" in msg:
                    relay["candidate"] = msg["candidate"]
                await _send(target.websocket, relay)

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — never let a malformed frame kill the room's bookkeeping below
        logger.exception("walkie: connection error on channel %s", channel_key)
    finally:
        room.connections.pop(connection_id, None)
        if room.speaker_connection_id == connection_id:
            await _release_floor(room, reason="disconnected")
        elif room.speaker_connection_id:
            # A listener (not the speaker) left mid-transmission — tell the
            # speaker so it can close that one mesh peer instead of leaving a
            # dead RTCPeerConnection open until the floor is next released.
            speaker_conn = room.connections.get(room.speaker_connection_id)
            if speaker_conn:
                await _send(speaker_conn.websocket, {"type": "listener_left", "connection_id": connection_id})
        await _broadcast_presence(room)
