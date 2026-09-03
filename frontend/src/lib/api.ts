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

// A 401 means the session cookie is missing/expired — bounce back to the login
// screen rather than letting every admin page fail silently or show stale data.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !window.location.pathname.startsWith("/admin/login")) {
      window.location.href = "/admin/login";
    }
    return Promise.reject(error);
  },
);
