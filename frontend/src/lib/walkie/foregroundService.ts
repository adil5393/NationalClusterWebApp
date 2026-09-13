// Keeps the Android app's WebView (and therefore the Walkie-Talkie
// WebSocket + any live WebRTC audio) running while the app is backgrounded
// or the screen is locked. Without this, Android throttles/freezes a
// backgrounded WebView's JS, so even a pure listener would silently stop
// receiving audio a few seconds after backgrounding.
//
// This only ever affects LISTENING. Transmitting still always stops
// immediately on blur/visibility-change/app pause (see call.ts and
// WalkieTalkie.tsx) — a persistent background PTT transmission was never
// the goal and would be a real privacy problem; a persistent background
// LISTENER is the actual point of a walkie-talkie.
//
// No-op on web and on iOS — this plugin is Android-only.
import { Capacitor } from "@capacitor/core";
import { ForegroundService, Importance, ServiceType } from "@capawesome-team/capacitor-android-foreground-service";

const CHANNEL_ID = "walkie_talkie";
const NOTIFICATION_ID = 8801;

let started = false;
let channelCreated = false;

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function ensureNotificationChannel(): Promise<void> {
  if (channelCreated) return;
  channelCreated = true;
  try {
    await ForegroundService.createNotificationChannel({
      id: CHANNEL_ID,
      name: "Walkie Talkie",
      description: "Keeps Walkie Talkie connected while the app is in the background",
      importance: Importance.Low,
    });
  } catch {
    // Channel may already exist from a previous app run — harmless either way.
  }
}

/** Starts (or, if already running, updates) the foreground service showing
 * which channel is being listened to. Safe to call every time the selected
 * channel changes. Never throws — a failure here (e.g. the user denied
 * notification/mic permission) must not block using Walkie-Talkie in the
 * foreground, since background survival is a bonus, not a requirement. */
export async function syncWalkieForegroundService(channelName: string): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    if (started) {
      await ForegroundService.updateForegroundService({
        id: NOTIFICATION_ID,
        title: "Walkie Talkie active",
        body: `Listening on ${channelName}`,
        smallIcon: "ic_launcher_foreground",
        notificationChannelId: CHANNEL_ID,
      });
      return;
    }
    const perm = await ForegroundService.checkPermissions();
    if (perm.display !== "granted") {
      await ForegroundService.requestPermissions();
    }
    await ensureNotificationChannel();
    await ForegroundService.startForegroundService({
      id: NOTIFICATION_ID,
      title: "Walkie Talkie active",
      body: `Listening on ${channelName}`,
      smallIcon: "ic_launcher_foreground",
      notificationChannelId: CHANNEL_ID,
      serviceType: ServiceType.Microphone,
      silent: true,
    });
    started = true;
  } catch {
    // e.g. RECORD_AUDIO not granted yet, or notification permission denied.
  }
}

/** Call when leaving the Walkie-Talkie page entirely (unmount, logout) —
 * never on blur/visibility-change, since staying alive through those is the
 * entire point. */
export async function stopWalkieForegroundService(): Promise<void> {
  if (!started) return;
  started = false;
  try {
    await ForegroundService.stopForegroundService();
  } catch {
    // Already stopped — fine.
  }
}
