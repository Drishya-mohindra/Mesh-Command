const BASE = "/api";

// Read the session id straight from localStorage rather than importing session.ts,
// so this stays a leaf module with no import cycle (session.ts is UI-facing).
function sessionId(): string | null {
  try {
    const raw = localStorage.getItem("mesh-command-post-session");
    return raw ? JSON.parse(raw).id ?? null : null;
  } catch {
    return null;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const id = sessionId();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      // The server throttles writes per session id. Send it so each phone gets its
      // own budget — without this every device on the AP shares the IP fallback and
      // would throttle everyone else.
      headers: {
        "Content-Type": "application/json",
        ...(id ? { "X-Session-Id": id } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    // fetch() rejects with the browser's raw "Failed to fetch" / "Load failed" for
    // network-level errors. That string ends up in a Toast in front of someone who
    // just wants help, so translate it into what actually went wrong and what to do.
    throw new Error("Can't reach the command post — check you're still on the WiFi.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Something went wrong (${res.status}). Try again.`);
  }
  return res.json();
}

export const api = {
  join: (nickname: string, role: string) =>
    request("/auth/join", { method: "POST", body: JSON.stringify({ nickname, role }) }),

  getBroadcasts: () => request("/broadcasts"),
  postBroadcast: (author: string, role: string, message: string) =>
    request("/broadcasts", { method: "POST", body: JSON.stringify({ author, role, message }) }),

  getRequests: () => request("/requests"),
  postRequest: (author: string, category: string, note: string, urgency: string) =>
    request("/requests", { method: "POST", body: JSON.stringify({ author, category, note, urgency }) }),
  updateRequestStatus: (id: number, status: string) =>
    request(`/requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getRequestStats: () => request("/requests/stats/summary"),
  getActivity: () => request("/activity"),

  getPins: () => request("/map"),
  postPin: (author: string, label: string, type: string, lat: number, lng: number) =>
    request("/map", { method: "POST", body: JSON.stringify({ author, label, type, lat, lng }) }),
};
