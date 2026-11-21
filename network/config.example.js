// Replace the hostname with your deployed HTTPS/WSS PeerServer.
// This file is a template, and is not loaded by the game.
window.CFLanConfig = {
  signaling: {
    host: "YOUR-SIGNALING-HOST",
    port: 443,
    path: "/crossfort",
    secure: true,
    key: "crossfort",
    // Same-Wi-Fi direct connection needs no TURN. To support restrictive NATs,
    // configure your own STUN/TURN service here. Never commit long-lived TURN
    // secrets: use short-lived credentials from your authenticated service.
    config: { iceServers: [] },
  },
};
