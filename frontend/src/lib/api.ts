import axios from "axios";
import { Capacitor } from "@capacitor/core";

// Browsers use the same origin and therefore need no explicit base URL. The
// Android Capacitor WebView runs at https://localhost, so it must call the
// public API origin explicitly. Exported so every other place that builds a
// backend URL (download links, the live WebSocket) shares this same
// APK-aware resolution instead of reading REACT_APP_BACKEND_URL directly and
// silently breaking inside the native app.
export const BASE_URL = Capacitor.isNativePlatform()
  ? "https://kabaddinationalscluster.info"
  : (import.meta.env.REACT_APP_BACKEND_URL ?? "");

// A relative path the backend hands back (e.g. "/assets/about/x.jpg") needs
// BASE_URL prefixed in the native app (see BASE_URL above) but works as-is
// in a browser tab (same origin). An already-absolute URL (http/https, e.g.
// a Drive link) is returned untouched.
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// A 401 from the organizer portal USUALLY means the session cookie is
// missing/expired — bounce back to the login screen rather than letting
// every admin page fail silently or show stale data. But not every 401 on
// an /admin route means that: several endpoints reuse 401 for "wrong
// confirmation password" on an otherwise-still-logged-in session (e.g.
// attendance.py's un-mark-attendance, payments.py's clear-all-billing-data)
// — those must show their own "incorrect password" message locally instead
// of yanking the admin away mid-dialog. security.py's require_auth/
// require_admin/require_module always use the exact string "Not
// authenticated" for a real expired/missing session, which is what every
// one of those "wrong password" 401s deliberately does NOT say — so that
// message, not the bare status code, is what actually means "you got
// logged out." Scoped to /admin routes only: public pages (team portal
// reveal-contacts, participant photo upload) also get 401s for their own
// reasons and already handle those locally regardless.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const path = window.location.pathname;
    const isSessionExpired = error?.response?.data?.detail === "Not authenticated";
    if (isSessionExpired && path.startsWith("/admin") && !path.startsWith("/admin/login")) {
      window.location.href = "/admin/login";
    }
    return Promise.reject(error);
  },
);
