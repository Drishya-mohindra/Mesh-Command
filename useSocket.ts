import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

// A stable identity for THIS tab that survives socket reconnects but is unique
// per browser tab. sessionStorage is per-tab and persists across reloads and
// reconnects within the tab, so the server's presence tracker treats a WiFi
// flap as the same device instead of a new one. (crypto.randomUUID is available
// in every browser this app targets; fall back just in case.)
function getClientId(): string {
  const KEY = "mesh-command-post-client-id";
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // sessionStorage can throw in locked-down/private modes — degrade to a
    // per-load id rather than failing to connect at all.
    return `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function getSocket() {
  if (!sharedSocket) {
    sharedSocket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      auth: { clientId: getClientId() },
    });
  }
  return sharedSocket;
}

export function useSocket() {
  const socketRef = useRef<Socket>(getSocket());
  const [deviceCount, setDeviceCount] = useState(0);
  const [connected, setConnected] = useState(socketRef.current.connected);

  useEffect(() => {
    const socket = socketRef.current;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onDevices = (n: number) => setDeviceCount(n);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("stats:devices", onDevices);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("stats:devices", onDevices);
    };
  }, []);

  return { socket: socketRef.current, deviceCount, connected };
}
