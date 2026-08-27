import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.knorg.staff',
  appName: 'KNORG',
  webDir: 'dist',
  // Tried matching server.hostname to the API domain to dodge CORS — reverted.
  // It's a known Capacitor bug: with a custom hostname, requests to /api/*
  // get treated as local file lookups instead of reaching the real server
  // (ionic-team/capacitor#6875), which is exactly the "can't reach server"
  // failure we hit. This plugin is the actually-supported fix: it patches
  // fetch/XMLHttpRequest (what axios uses) to go through native HTTP instead
  // of the WebView's own networking, so CORS and cross-site cookie rules
  // (both browser-only concepts) never apply in the first place — the app
  // stays on the default https://localhost origin, untouched otherwise.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
