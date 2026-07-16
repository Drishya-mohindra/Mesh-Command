export type Role = "civilian" | "responder" | "coordinator";

export interface Session {
  id: string;
  nickname: string;
  role: Role;
}

const KEY = "mesh-command-post-session";

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
