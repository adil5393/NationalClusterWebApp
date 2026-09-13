// Short, quiet local UI cues for PTT transitions — synthesized tones via the
// Web Audio API rather than shipped audio files, so there's nothing to
// record/store/host: this is UI feedback only, not the actual walkie audio
// (that's WebRTC, handled entirely in call.ts).
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

function beep(freq: number, durationMs: number, volume = 0.12) {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(c.destination);
    const now = c.currentTime;
    osc.start(now);
    // Quick fade rather than a hard stop, so it doesn't click.
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // Never let a UI chime break the actual feature.
  }
}

export const playFloorGranted = () => beep(880, 90);
export const playFloorReleased = () => beep(440, 90);
export const playChannelBusy = () => {
  beep(220, 70);
  setTimeout(() => beep(220, 70), 110);
};
