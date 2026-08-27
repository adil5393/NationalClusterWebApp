import axios from "axios";
import { Capacitor } from "@capacitor/core";

// Browsers use the same origin and therefore need no explicit base URL. The
// Android Capacitor WebView runs at https://localhost, so it must call the
// public API origin explicitly.
const BASE_URL = Capacitor.isNativePlatform()
  ? "https://kabaddinationalscluster.info"
  : (import.meta.env.REACT_APP_BACKEND_URL ?? "");

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
