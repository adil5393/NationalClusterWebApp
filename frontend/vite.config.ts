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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          if (id.includes("node_modules/axios") || id.includes("node_modules/sonner")) {
            return "vendor-utils";
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: process.env.VITE_HMR_WSS === "true" ? { clientPort: 443, protocol: "wss" } : undefined,
    watch: { ignored: ["**/node_modules/**", "**/.git/**", "**/android/**", "**/dist/**"], usePolling: true, interval: 300 },
  },
  preview: { host: true, port: 5173 },
});
