// Authenticated WebSocket signaling client for one Walkie-Talkie channel.
// Mirrors the message protocol implemented in backend/app/routers/walkie.py
// exactly — this module only ever relays connection ids and floor-control
// messages, never audio (that's call.ts, over WebRTC). Kept isolated from
// both call.ts and the React page so each layer can be tested/replaced on
// its own (e.g. swapping the mesh topology for an SFU later never has to
// touch this file's contract).
import { BASE_URL } from "@/lib/api";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface ConnectedMessage {
  type: "connected";
  connection_id: string;
  name: string;
  is_admin: boolean;
  can_transmit: boolean;
  listener_count: number;
  speaking: string | null;
  max_floor_seconds: number;
}
export interface PresenceMessage {
  type: "presence";
  count: number;
}
export interface FloorGrantedMessage {
  type: "floor_granted";
  listeners: string[];
  max_seconds: number;
}
export interface FloorDeniedMessage {
  type: "floor_denied";
  reason: "busy" | "forbidden";
  speaker_name?: string | null;
}
export interface SpeakerStartedMessage {
  type: "speaker_started";
  name: string;
}
export interface SpeakerStoppedMessage {
  type: "speaker_stopped";
  reason: string;
}
export interface WebrtcRelayMessage {
  type: "webrtc_offer" | "webrtc_answer" | "webrtc_ice";
  from: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}
export interface ListenerJoinedMessage {
  type: "listener_joined";
  connection_id: string;
}
export interface ListenerLeftMessage {
  type: "listener_left";
  connection_id: string;
}
export type ServerMessage =
  | ConnectedMessage
  | PresenceMessage
  | FloorGrantedMessage
  | FloorDeniedMessage
  | SpeakerStartedMessage
  | SpeakerStoppedMessage
  | WebrtcRelayMessage
  | ListenerJoinedMessage
  | ListenerLeftMessage;

type Listener = (msg: ServerMessage) => void;

function wsUrl(channelKey: string): string {
  // Same "BASE_URL, falling back to the page's own origin for a plain
  // browser tab" reasoning as lib/live.ts's wsUrl — duplicated rather than
  // imported since that helper isn't exported and this module is meant to
  // stand alone.
  const base = BASE_URL || window.location.origin;
  return base.replace(/^http/, "ws") + `/api/walkie/ws/${encodeURIComponent(channelKey)}`;
}

export class WalkieSignaling {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private everConnected = false;

  constructor(
    private channelKey: string,
    private onStatusChange: (status: ConnectionStatus) => void,
  ) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  private open(): void {
    if (this.stopped) return;
    this.onStatusChange(this.everConnected ? "reconnecting" : "connecting");
    const ws = new WebSocket(wsUrl(this.channelKey));
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.everConnected = true;
      this.onStatusChange("connected");
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const forType = this.listeners.get(msg.type);
      if (forType) for (const cb of forType) cb(msg);
      const forAll = this.listeners.get("*");
      if (forAll) for (const cb of forAll) cb(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.stopped) return;
      this.onStatusChange("reconnecting");
      const delay = Math.min(1000 * 2 ** this.attempt, 10000);
      this.attempt += 1;
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {
      // onclose always follows onerror for a WebSocket — nothing extra to do.
    };
  }

  send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  on(type: ServerMessage["type"] | "*", cb: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }

  /** True once we've received at least one server message on this socket —
   * lets call.ts distinguish "never connected" from "briefly reconnecting". */
  isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
    this.onStatusChange("offline");
  }
}
