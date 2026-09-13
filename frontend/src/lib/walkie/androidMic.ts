// Thin bridge to the native MicPermissionPlugin.java (registered directly in
// the Android project — see android/app/src/main/java/com/knorg/staff/
// MicPermissionPlugin.java — not an npm package, since Capacitor's
// registerPlugin() only needs the two sides to agree on a plugin name).
// Only relevant on native platforms: a browser tab never touches this, and
// getUserMedia's own permission prompt handles everything there already.
import { registerPlugin, Capacitor } from "@capacitor/core";

interface MicPermissionPlugin {
  check(): Promise<{ granted: boolean }>;
  request(): Promise<{ granted: boolean }>;
}

const MicPermission = registerPlugin<MicPermissionPlugin>("MicPermission");

/** Resolves once the native RECORD_AUDIO permission is confirmed granted, or
 * false if the user refused it. A no-op (always true) outside the native
 * app — a browser tab's own getUserMedia prompt is the only gate there. */
export async function ensureAndroidMicPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { granted } = await MicPermission.request();
    return granted;
  } catch {
    return false;
  }
}
