/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly REACT_APP_BACKEND_URL: string;
  // Walkie-Talkie WebRTC ICE config (see lib/walkie/iceConfig.ts) — all
  // optional; V1 falls back to a public STUN server when unset. Setting the
  // TURN trio is the entire migration path to a self-hosted coturn later.
  readonly REACT_APP_WALKIE_STUN_URL?: string;
  readonly REACT_APP_WALKIE_TURN_URL?: string;
  readonly REACT_APP_WALKIE_TURN_USERNAME?: string;
  readonly REACT_APP_WALKIE_TURN_CREDENTIAL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
