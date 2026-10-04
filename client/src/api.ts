// Thin fetch wrapper around the backend's three endpoints
// (src/server/routes.js) and JWT storage. No business logic here - the
// server is the source of truth for everything, this just shapes HTTP
// calls and types their responses.

export interface Employee {
  id: string;
  name: string;
  department: string;
  status: string;
}

export interface ToolActivityEntry {
  name: string;
  args: Record<string, unknown>;
  result: string; // the tool's raw JSON string result
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  toolActivity?: ToolActivityEntry[];
}

// Unset -> "" -> fetch("/api/login") etc. stay relative, resolving
// against whatever origin served this page (the dev proxy, or
// server.js serving client/dist - today's two modes, unchanged). Set at
// build time to point a separately-deployed frontend at a backend
// running on a different origin entirely.
const API_BASE = import.meta.env.VITE_API_URL ?? "";

const TOKEN_KEY = "hr-chat-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseOrThrow(res: Response) {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export async function login(
  employeeId: string,
  password: string
): Promise<{ token: string; employee: Employee }> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, password }),
  });
  return parseOrThrow(res);
}

export async function me(): Promise<Employee> {
  const res = await fetch(`${API_BASE}/api/me`, { headers: authHeaders() });
  return parseOrThrow(res);
}

export async function sendMessage(
  message: string
): Promise<{ answer: string; toolActivity: ToolActivityEntry[] }> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return parseOrThrow(res);
}
