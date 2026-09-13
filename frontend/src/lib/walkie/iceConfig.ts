// ICE server configuration for the Walkie-Talkie WebRTC layer — kept in its
// own tiny module (rather than hard-coded inside call.ts) specifically so
// that adding a self-hosted TURN server later is a deployment/environment
// change, not a code change. Uses the same REACT_APP_* env-var convention
// already established by lib/api.ts's REACT_APP_BACKEND_URL.
//
// V1 ships STUN-only (a free public server, zero infrastructure). TURN is
// deliberately not deployed yet — see the Walkie-Talkie implementation
// notes for when it becomes necessary (clients on restrictive/cellular
// networks that direct P2P can't traverse). Setting the three TURN env vars
// below is the entire migration path when that day comes; call.ts never
// needs to change.
export function getIceServers(): RTCIceServer[] {
  const env = import.meta.env;
  const servers: RTCIceServer[] = [];

  const stunUrl = (env.REACT_APP_WALKIE_STUN_URL as string | undefined)?.trim();
  servers.push({ urls: stunUrl || "stun:stun.l.google.com:19302" });

  const turnUrl = (env.REACT_APP_WALKIE_TURN_URL as string | undefined)?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: (env.REACT_APP_WALKIE_TURN_USERNAME as string | undefined)?.trim() || undefined,
      credential: (env.REACT_APP_WALKIE_TURN_CREDENTIAL as string | undefined)?.trim() || undefined,
    });
  }

  return servers;
}
