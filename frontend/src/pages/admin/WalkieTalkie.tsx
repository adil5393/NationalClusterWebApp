import { Mic, Radio, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { useWalkie } from "@/lib/walkie/WalkieProvider";

// The actual WebSocket/WebRTC connection lives in WalkieProvider (mounted
// once at AdminLayout level, see AdminLayout.tsx) so it survives navigating
// to any other /admin/* page — this component is purely a view over that
// shared connection plus the PTT button, which is the one thing that still
// only exists here.
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function WalkieTalkie() {
  const {
    channels,
    loadingChannels,
    selectedKey,
    setSelectedKey,
    status,
    listenerCount,
    speakingName,
    isTransmitting,
    elapsed,
    busyFlash,
    canTransmit,
    beginTransmit,
    endTransmit,
  } = useWalkie();

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
