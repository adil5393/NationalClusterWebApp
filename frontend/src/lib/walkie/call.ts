// Mesh WebRTC audio layer for one Walkie-Talkie channel, built on top of
// signaling.ts. Deliberately isolated from the React page (see
// pages/admin/WalkieTalkie.tsx) — it owns every RTCPeerConnection and every
// remote <audio> element itself, exposing only a small event-driven API, so
// the topology (mesh today, an SFU later if "All Staff" scale ever needs
// it) can change without the page or the signaling/permission layer moving
// at all.
//
// Floor control is server-authoritative (see routers/walkie.py) — this
// class never assumes it holds the floor; it only starts transmitting after
// an explicit floor_granted, and immediately releases on speaker_stopped
// regardless of why the server sent it (explicit release, disconnect, or
// the MAX_FLOOR_SECONDS dead-man timeout).
import { getIceServers } from "./iceConfig";
import { ensureAndroidMicPermission } from "./androidMic";
import { WalkieSignaling, type ConnectionStatus } from "./signaling";

export type CallEvent =
  | { type: "presence"; count: number }
  | { type: "floor_denied"; reason: "busy" | "forbidden"; speakerName?: string | null }
  | { type: "speaker_started"; name: string }
  | { type: "speaker_stopped" };

type CallEventListener = (e: CallEvent) => void;
type StartResult = { ok: true } | { ok: false; reason: "busy" | "forbidden" | "mic_denied" | "mic_error"; speakerName?: string | null };

export class WalkieCall {
  private signaling: WalkieSignaling;
  private iceServers: RTCIceServer[];
  private canTransmit = false;
  private transmitting = false;

  // Listener side: at most one entry at a time (single floor per channel),
  // keyed by the current speaker's connection id so a fresh offer from the
  // same speaker (a quick re-press) can cleanly replace the old peer.
  private listenerPeers = new Map<string, RTCPeerConnection>();
  private audioEls = new Map<string, HTMLAudioElement>();

  // Speaker side: one outgoing peer per current listener.
  private localStream: MediaStream | null = null;
  private speakerPeers = new Map<string, RTCPeerConnection>();

  private listeners = new Set<CallEventListener>();
  private unsubs: (() => void)[] = [];

  constructor(channelKey: string, onStatus: (status: ConnectionStatus) => void) {
    this.iceServers = getIceServers();
    this.signaling = new WalkieSignaling(channelKey, onStatus);
    this.wireSignaling();
  }

  connect(): void {
    this.signaling.connect();
  }

  on(cb: CallEventListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  isTransmitting(): boolean {
    return this.transmitting;
  }

  canCurrentlyTransmit(): boolean {
    return this.canTransmit;
  }

  // ---------- Speaker side ----------

  async startTransmitting(): Promise<StartResult> {
    if (this.transmitting) return { ok: true };
    if (!this.canTransmit) return { ok: false, reason: "forbidden" };

    // Ask the server FIRST — never touch the microphone for a request that
    // might just come back "channel busy" (see the Walkie-Talkie spec's
    // "don't request mic access unless actually transmitting" rule).
    const grant = await this.requestFloor();
    if (!grant.granted) return { ok: false, reason: grant.reason, speakerName: grant.speakerName };

    // Android: the WebView's getUserMedia only succeeds once the native
    // RECORD_AUDIO runtime permission is already granted — a no-op on a
    // plain browser tab, where getUserMedia's own prompt is the only gate.
    const micAllowed = await ensureAndroidMicPermission();
    if (!micAllowed) {
      this.signaling.send({ type: "release_floor" });
      return { ok: false, reason: "mic_denied" };
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      // We already hold the floor server-side at this point — give it back
      // immediately rather than leave the channel locked on an account that
      // can't actually transmit.
      this.signaling.send({ type: "release_floor" });
      return { ok: false, reason: "mic_denied" };
    }

    this.transmitting = true;
    for (const listenerId of grant.listeners) {
      await this.offerTo(listenerId);
    }
    return { ok: true };
  }

  /** Safe to call unconditionally from any termination path (pointerup,
   * pointercancel, lostpointercapture, blur, visibility change, unmount,
   * channel switch, app pause, disconnect) — a no-op if not transmitting. */
  stopTransmitting(): void {
    if (!this.transmitting) return;
    this.signaling.send({ type: "release_floor" });
    this.teardownAsSpeaker();
  }

  private requestFloor(): Promise<
    { granted: true; listeners: string[] } | { granted: false; reason: "busy" | "forbidden"; speakerName?: string | null }
  > {
    return new Promise((resolve) => {
      const offGranted = this.signaling.on("floor_granted", (msg) => {
        offGranted();
        offDenied();
        if (msg.type === "floor_granted") resolve({ granted: true, listeners: msg.listeners });
      });
      const offDenied = this.signaling.on("floor_denied", (msg) => {
        offGranted();
        offDenied();
        if (msg.type === "floor_denied") resolve({ granted: false, reason: msg.reason, speakerName: msg.speaker_name });
      });
      this.signaling.send({ type: "request_floor" });
    });
  }

  private async offerTo(listenerId: string): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.speakerPeers.set(listenerId, pc);
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.send({ type: "webrtc_ice", to: listenerId, candidate: ev.candidate.toJSON() });
      }
    };
    // A dead peer (NAT traversal failure, listener's tab crashing without a
    // clean disconnect reaching us yet, etc.) must not sit open until the
    // whole floor is released — close and drop it as soon as WebRTC itself
    // reports the connection is gone.
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (this.speakerPeers.get(listenerId) === pc) {
          pc.close();
          this.speakerPeers.delete(listenerId);
        }
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.send({ type: "webrtc_offer", to: listenerId, sdp: offer });
  }

  private teardownAsSpeaker(): void {
    if (this.localStream) {
      // Stopping every track (not just closing peers) is what actually
      // turns off the OS/Android microphone indicator immediately.
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    for (const pc of this.speakerPeers.values()) pc.close();
    this.speakerPeers.clear();
    this.transmitting = false;
  }

  // ---------- Listener side ----------

  private async onOffer(fromSpeakerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    this.teardownAllListenerPeers(); // only one speaker can ever be active at once
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.listenerPeers.set(fromSpeakerId, pc);
    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      const audioEl = new Audio();
      audioEl.autoplay = true;
      (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audioEl.srcObject = stream;
      this.audioEls.set(fromSpeakerId, audioEl);
      audioEl.play().catch(() => {
        // Autoplay can be blocked until the user has interacted with the
        // page at all; pressing/holding PTT (or any tap) already satisfies
        // that, so this normally resolves itself with no further action.
      });
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.send({ type: "webrtc_ice", to: fromSpeakerId, candidate: ev.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (this.listenerPeers.get(fromSpeakerId) === pc) {
          pc.close();
          this.listenerPeers.delete(fromSpeakerId);
          const el = this.audioEls.get(fromSpeakerId);
          if (el) {
            el.pause();
            el.srcObject = null;
            this.audioEls.delete(fromSpeakerId);
          }
        }
      }
    };
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.signaling.send({ type: "webrtc_answer", to: fromSpeakerId, sdp: answer });
  }

  private onAnswer(fromListenerId: string, sdp: RTCSessionDescriptionInit): void {
    const pc = this.speakerPeers.get(fromListenerId);
    if (!pc) return;
    pc.setRemoteDescription(sdp).catch(() => {});
  }

  private onIce(fromId: string, candidate: RTCIceCandidateInit): void {
    const pc = this.speakerPeers.get(fromId) || this.listenerPeers.get(fromId);
    if (!pc) return;
    pc.addIceCandidate(candidate).catch(() => {});
  }

  private teardownAllListenerPeers(): void {
    for (const pc of this.listenerPeers.values()) pc.close();
    this.listenerPeers.clear();
    for (const el of this.audioEls.values()) {
      el.pause();
      el.srcObject = null;
    }
    this.audioEls.clear();
  }

  // ---------- Wiring + lifecycle ----------

  private wireSignaling(): void {
    this.unsubs.push(
      this.signaling.on("connected", (msg) => {
        if (msg.type !== "connected") return;
        this.canTransmit = msg.can_transmit;
        this.emit({ type: "presence", count: msg.listener_count });
        if (msg.speaking) this.emit({ type: "speaker_started", name: msg.speaking });
      }),
    );
    this.unsubs.push(
      this.signaling.on("presence", (msg) => {
        if (msg.type === "presence") this.emit({ type: "presence", count: msg.count });
      }),
    );
    this.unsubs.push(
      this.signaling.on("speaker_started", (msg) => {
        if (msg.type === "speaker_started") this.emit({ type: "speaker_started", name: msg.name });
      }),
    );
    this.unsubs.push(
      this.signaling.on("speaker_stopped", () => {
        // Broadcast to everyone, including whoever was speaking (if that's
        // us, this is exactly how a server-forced release — timeout or
        // disconnect elsewhere — reaches this client and turns the mic off).
        this.teardownAsSpeaker();
        this.teardownAllListenerPeers();
        this.emit({ type: "speaker_stopped" });
      }),
    );
    this.unsubs.push(
      this.signaling.on("webrtc_offer", (msg) => {
        if (msg.type === "webrtc_offer" && msg.sdp) this.onOffer(msg.from, msg.sdp);
      }),
    );
    this.unsubs.push(
      this.signaling.on("webrtc_answer", (msg) => {
        if (msg.type === "webrtc_answer" && msg.sdp) this.onAnswer(msg.from, msg.sdp);
      }),
    );
    this.unsubs.push(
      this.signaling.on("webrtc_ice", (msg) => {
        if (msg.type === "webrtc_ice" && msg.candidate) this.onIce(msg.from, msg.candidate);
      }),
    );
    this.unsubs.push(
      this.signaling.on("listener_joined", (msg) => {
        // Only the current speaker ever receives this — a new listener who
        // joined after PTT was already pressed still needs an offer, or
        // they'd hear nothing until the next transmission.
        if (msg.type === "listener_joined" && this.transmitting) this.offerTo(msg.connection_id);
      }),
    );
    this.unsubs.push(
      this.signaling.on("listener_left", (msg) => {
        if (msg.type !== "listener_left") return;
        const pc = this.speakerPeers.get(msg.connection_id);
        if (pc) {
          pc.close();
          this.speakerPeers.delete(msg.connection_id);
        }
      }),
    );
  }

  private emit(e: CallEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  /** Full teardown — call on channel switch or component unmount. Releases
   * any held floor first (safe/no-op if not transmitting). */
  destroy(): void {
    this.stopTransmitting();
    this.teardownAllListenerPeers();
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.listeners.clear();
    this.signaling.close();
  }
}
