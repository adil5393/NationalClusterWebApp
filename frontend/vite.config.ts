import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The Emergent preview serves the frontend on port 3000 over HTTPS (443).
export default defineConfig({
  plugins: [react()],
  // Expose REACT_APP_* vars (platform convention) to import.meta.env
  envPrefix: ["VITE_", "REACT_APP_"],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: process.env.VITE_HMR_WSS === "true" ? { clientPort: 443, protocol: "wss" } : undefined,
    // android/** alone is 17k+ files (Gradle build output included) — polling
    // all of it every 300ms over the Docker/Windows bind mount was starving
    // the dev server's event loop until it stopped responding to requests.
    watch: { ignored: ["**/node_modules/**", "**/.git/**", "**/android/**", "**/dist/**"], usePolling: true, interval: 300 },
  },
  preview: { host: true, port: 5173 },
});
