import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Mic, Radio, Wifi, WifiOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { WalkieCall } from "@/lib/walkie/call";
import type { ConnectionStatus } from "@/lib/walkie/signaling";
import { playFloorGranted, playFloorReleased, playChannelBusy } from "@/lib/walkie/sounds";
import { ensureAndroidMicPermission } from "@/lib/walkie/androidMic";
import { syncWalkieForegroundService, stopWalkieForegroundService } from "@/lib/walkie/foregroundService";

interface Channel {
  key: string;
  name: string;
  icon: string | null;
  transmit_restricted: boolean;
  can_transmit: boolean;
}

// Mirrors backend/app/walkie_state.py's MAX_FLOOR_SECONDS/FLOOR_WARNING_SECONDS
// — kept as a matching frontend constant rather than fetched, since it only
// drives the local countdown UI; the server enforces the real cutoff
// regardless of what this client displays.
const FLOOR_WARNING_SECONDS = 25;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function WalkieTalkie() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [listenerCount, setListenerCount] = useState(0);
  const [speakingName, setSpeakingName] = useState<string | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busyFlash, setBusyFlash] = useState<string | null>(null);

  const callRef = useRef<WalkieCall | null>(null);
  const pressedRef = useRef(false);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningShownRef = useRef(false);

  useEffect(() => {
    api
      .get<Channel[]>("/walkie/channels")
      .then((r) => {
        setChannels(r.data);
        if (r.data.length > 0) setSelectedKey(r.data[0].key);
      })
      .catch(() => toast.error("Could not load walkie channels"))
      .finally(() => setLoadingChannels(false));
  }, []);

  // Android only: asked once up front, on opening this page — not lazily at
  // first PTT press like the browser's own getUserMedia prompt — because
  // Android requires RECORD_AUDIO already granted before the Microphone-type
  // foreground service (see foregroundService.ts) can start. That service is
  // what lets LISTENING keep working while the app is backgrounded/locked;
  // transmitting is unaffected and still always stops on blur/visibility
  // change regardless of this permission's state.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) ensureAndroidMicPermission();
  }, []);

  const selectedChannel = useMemo(() => channels.find((c) => c.key === selectedKey) ?? null, [channels, selectedKey]);

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setElapsed(0);
    warningShownRef.current = false;
  };

  // One WalkieCall per selected channel — switching channels tears the old
  // one down (which itself releases any held floor and stops the mic/peers
  // before closing its socket) and opens a fresh one.
  useEffect(() => {
    if (!selectedKey) return;
    setSpeakingName(null);
    setIsTransmitting(false);
    stopElapsedTimer();

    const call = new WalkieCall(selectedKey, setStatus);
    callRef.current = call;
    const off = call.on((e) => {
      if (e.type === "presence") {
        setListenerCount(e.count);
      } else if (e.type === "speaker_started") {
        setSpeakingName(e.name);
      } else if (e.type === "speaker_stopped") {
        setSpeakingName(null);
        setIsTransmitting(call.isTransmitting());
        stopElapsedTimer();
      } else if (e.type === "floor_denied") {
        playChannelBusy();
        setBusyFlash(e.reason === "busy" ? `Channel busy — ${e.speakerName ?? "someone"} is speaking` : "You don't have permission to transmit on this channel");
        setTimeout(() => setBusyFlash(null), 2500);
      }
    });
    call.connect();

    return () => {
      off();
      call.destroy();
      callRef.current = null;
      stopElapsedTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // Starts (or updates) the Android foreground service once actually
  // connected, so its notification always names the channel currently being
  // listened to. No-op on web/iOS — see foregroundService.ts.
  useEffect(() => {
    if (status === "connected" && selectedChannel) {
      syncWalkieForegroundService(selectedChannel.name);
    }
  }, [status, selectedChannel]);

  const beginTransmit = async () => {
    const call = callRef.current;
    if (!call || isTransmitting) return;
    pressedRef.current = true;
    const result = await call.startTransmitting();
    if (!pressedRef.current) {
      // User already released while we were awaiting floor grant/mic setup
      // — never leave the UI (or the mic) stuck in "transmitting".
      call.stopTransmitting();
      return;
    }
    if (result.ok) {
      playFloorGranted();
      setIsTransmitting(true);
      warningShownRef.current = false;
      elapsedTimerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next === FLOOR_WARNING_SECONDS && !warningShownRef.current) {
            warningShownRef.current = true;
            toast.warning("Transmission will end soon");
          }
          return next;
        });
      }, 1000);
    } else if (result.reason === "busy") {
      playChannelBusy();
      setBusyFlash(`Channel busy — ${result.speakerName ?? "someone"} is speaking`);
      setTimeout(() => setBusyFlash(null), 2500);
    } else if (result.reason === "mic_denied") {
      toast.error("Microphone permission is required to transmit");
    } else if (result.reason === "forbidden") {
      toast.error("You don't have permission to transmit on this channel");
    } else {
      toast.error("Could not start transmitting");
    }
  };

  const endTransmit = () => {
    pressedRef.current = false;
    if (!callRef.current?.isTransmitting()) return;
    callRef.current?.stopTransmitting();
    setIsTransmitting(false);
    stopElapsedTimer();
    playFloorReleased();
  };

  // Every one of these must safely end an in-progress transmission — never
  // leave the UI (or a live mic) stuck showing TRANSMITTING.
  useEffect(() => {
    const onBlur = () => endTransmit();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") endTransmit();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      // Component unmount (navigating away entirely) — belt-and-suspenders
      // on top of the per-channel cleanup effect above. The foreground
      // service is stopped ONLY here, never on blur/visibility-change —
      // staying alive through those is the entire point of it.
      callRef.current?.destroy();
      stopWalkieForegroundService();
    };
  }, []);

  const canTransmit = selectedChannel?.can_transmit ?? false;
  const channelBusy = !!speakingName && !isTransmitting;

  const statusPill = {
    connected: { icon: Wifi, label: "Connected", tone: "text-emerald-400" },
    connecting: { icon: Loader2, label: "Connecting…", tone: "text-slate-400" },
    reconnecting: { icon: Loader2, label: "Reconnecting…", tone: "text-amber-400" },
    offline: { icon: WifiOff, label: "Offline", tone: "text-red-400" },
  }[status];

  if (loadingChannels) {
    return (
      <div className="py-20">
        <Spinner label="Loading Walkie-Talkie channels…" />
      </div>
    );
  }

  return (
    <div data-testid="admin-walkie" className="mx-auto max-w-md space-y-5">
      <div className="text-center pt-2">
        <span className="text-xs font-heading font-extrabold uppercase tracking-widest text-gold">
          OPERATIONAL COMMS
        </span>
        <h1 className="mt-1 font-heading text-2xl font-black tracking-tight text-white">Walkie Talkie</h1>
      </div>

      <Select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} data-testid="walkie-channel-select">
        {channels.map((c) => (
          <option key={c.key} value={c.key}>
            {c.icon ? `${c.icon} ` : ""}
            {c.name}
          </option>
        ))}
      </Select>

      <div className="flex items-center justify-center gap-2 text-xs font-semibold" data-testid="walkie-connection-status">
        <statusPill.icon className={cn("h-3.5 w-3.5", statusPill.tone, status !== "connected" && "animate-spin")} />
        <span className={statusPill.tone}>{statusPill.label}</span>
        {status === "connected" && (
          <span className="text-slate-500">
            • {listenerCount} listening
          </span>
        )}
      </div>

      <div
        className={cn(
          "rounded-2xl border p-6 text-center transition-colors",
          isTransmitting
            ? "border-red-500/40 bg-red-500/10"
            : channelBusy
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-white/10 bg-obsidian-900",
        )}
        data-testid="walkie-speaker-area"
      >
        {isTransmitting ? (
          <div className="space-y-1">
            <p className="flex items-center justify-center gap-2 font-heading text-lg font-black text-red-400">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" /> TRANSMITTING
            </p>
            <p className="font-mono text-2xl font-bold text-white">{formatElapsed(elapsed)}</p>
          </div>
        ) : channelBusy ? (
          <div className="space-y-1">
            <p className="font-heading text-base font-bold text-amber-400">🎙 {speakingName} is talking</p>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Channel Busy</p>
          </div>
        ) : (
          <p className="font-heading text-base font-bold text-slate-400 tracking-wide">CHANNEL CLEAR</p>
        )}
      </div>

      {busyFlash && (
        <p className="text-center text-xs font-semibold text-amber-400" data-testid="walkie-busy-flash">
          {busyFlash}
        </p>
      )}

      <button
        type="button"
        disabled={!canTransmit || status !== "connected" || channelBusy}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          beginTransmit();
        }}
        onPointerUp={(e) => {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* capture may already be gone */
          }
          endTransmit();
        }}
        onPointerCancel={endTransmit}
        onLostPointerCapture={endTransmit}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="walkie-ptt-button"
        className={cn(
          "w-full select-none rounded-2xl py-8 font-heading font-black tracking-wide shadow-lg transition-all touch-none",
          "flex flex-col items-center justify-center gap-2",
          isTransmitting
            ? "bg-red-600 text-white scale-[0.98]"
            : canTransmit && status === "connected" && !channelBusy
              ? "bg-gold text-obsidian active:scale-[0.97]"
              : "bg-white/5 text-slate-500 cursor-not-allowed",
        )}
      >
        <Mic className="h-8 w-8" />
        <span className="text-sm">{isTransmitting ? "RELEASE TO STOP" : "HOLD TO TALK"}</span>
      </button>

      {!canTransmit && (
        <p className="text-center text-[11px] text-slate-500">
          You can listen to this channel but don't have permission to transmit.
        </p>
      )}

      <div className="space-y-1.5 pt-2">
        <h2 className="flex items-center gap-1.5 text-[10px] font-heading font-extrabold uppercase tracking-widest text-slate-500">
          <Radio className="h-3 w-3" /> Channels
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {channels.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSelectedKey(c.key)}
              data-testid={`walkie-channel-btn-${c.key}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                c.key === selectedKey
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]",
              )}
            >
              <span>{c.icon}</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
