// Lifts the Walkie-Talkie connection (WebSocket signaling + WebRTC audio)
// out of the WalkieTalkie page and into a provider mounted once at
// AdminLayout level — the same "runs for the whole authenticated admin
// session, not just one page" pattern AdminLayout already uses for Staff
// Live Map's location-reporting effect. Without this, navigating to any
// other /admin/* page unmounted the page component and killed the call,
// so a listener stopped hearing anything the moment they left the Walkie
// Talkie screen — not how a real walkie-talkie behaves.
//
// Transmitting is unaffected by this change and still only ever happens
// from the Walkie Talkie page's own PTT button; this only makes LISTENING
// (and the connection itself) survive in-app navigation.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { WalkieCall } from "./call";
import type { ConnectionStatus } from "./signaling";
import { playFloorGranted, playFloorReleased, playChannelBusy } from "./sounds";
import { ensureAndroidMicPermission } from "./androidMic";
import { syncWalkieForegroundService, stopWalkieForegroundService } from "./foregroundService";

export interface WalkieChannel {
  key: string;
  name: string;
  icon: string | null;
  transmit_restricted: boolean;
  can_transmit: boolean;
}

// Mirrors backend/app/walkie_state.py's FLOOR_WARNING_SECONDS — see
// WalkieTalkie.tsx's own copy of this comment for why it's duplicated
// rather than fetched.
const FLOOR_WARNING_SECONDS = 25;

interface WalkieContextValue {
  channels: WalkieChannel[];
  loadingChannels: boolean;
  selectedKey: string;
  setSelectedKey: (key: string) => void;
  selectedChannel: WalkieChannel | null;
  status: ConnectionStatus;
  listenerCount: number;
  speakingName: string | null;
  isTransmitting: boolean;
  elapsed: number;
  busyFlash: string | null;
  canTransmit: boolean;
  beginTransmit: () => void;
  endTransmit: () => void;
}

const WalkieContext = createContext<WalkieContextValue | null>(null);

export function useWalkie(): WalkieContextValue {
  const ctx = useContext(WalkieContext);
  if (!ctx) throw new Error("useWalkie() must be used within a WalkieProvider");
  return ctx;
}

/** `authenticated` mirrors AdminLayout's own `me?.authenticated` — the
 * connection only ever opens once a real session is confirmed, and is torn
 * down the moment AdminLayout itself unmounts (e.g. on logout, which
 * navigates to /admin/login — a sibling route outside this layout). */
export function WalkieProvider({ authenticated, children }: { authenticated: boolean; children: ReactNode }) {
  const [channels, setChannels] = useState<WalkieChannel[]>([]);
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
    if (!authenticated) return;
    api
      .get<WalkieChannel[]>("/walkie/channels")
      .then((r) => {
        setChannels(r.data);
        if (r.data.length > 0) setSelectedKey(r.data[0].key);
      })
      .catch(() => toast.error("Could not load walkie channels"))
      .finally(() => setLoadingChannels(false));
  }, [authenticated]);

  // Android only: asked once up front, on entering the admin session — not
  // lazily at first PTT press like the browser's own getUserMedia prompt —
  // because Android requires RECORD_AUDIO already granted before the
  // Microphone-type foreground service (see foregroundService.ts) can
  // start. That service is what lets LISTENING keep working while the app
  // is backgrounded/locked; transmitting is unaffected and still always
  // stops on blur/visibility change regardless of this permission's state.
  useEffect(() => {
    if (authenticated && Capacitor.isNativePlatform()) ensureAndroidMicPermission();
  }, [authenticated]);

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
  // before closing its socket) and opens a fresh one. This effect now lives
  // here instead of the page component, so it survives navigating to any
  // other /admin/* route — only a channel switch or logout tears it down.
  useEffect(() => {
    if (!authenticated || !selectedKey) return;
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
  }, [authenticated, selectedKey]);

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
  // leave the UI (or a live mic) stuck showing TRANSMITTING. Kept app-wide
  // (not page-scoped) since PTT could in principle be mid-press on any
  // admin page's lifetime once a floating control exists; harmless no-op
  // today since only the Walkie Talkie page can start a transmission.
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
      // Provider unmount — AdminLayout itself going away (logout navigates
      // to /admin/login, a sibling route outside this layout) or the app
      // closing. The foreground service is stopped ONLY here, never on
      // blur/visibility-change — staying alive through those is the entire
      // point of it.
      callRef.current?.destroy();
      stopWalkieForegroundService();
    };
  }, []);

  const canTransmit = selectedChannel?.can_transmit ?? false;

  const value: WalkieContextValue = {
    channels,
    loadingChannels,
    selectedKey,
    setSelectedKey,
    selectedChannel,
    status,
    listenerCount,
    speakingName,
    isTransmitting,
    elapsed,
    busyFlash,
    canTransmit,
    beginTransmit,
    endTransmit,
  };

  return <WalkieContext.Provider value={value}>{children}</WalkieContext.Provider>;
}
