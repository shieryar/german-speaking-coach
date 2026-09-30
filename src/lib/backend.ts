export type AuthSession = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } };
const AUTH_KEY = "german-coach-auth";
let anonymousSessionRequest: Promise<AuthSession> | null = null;

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return { url: url.replace(/\/$/, ""), key };
}

async function authFetch(path: string, method: string, body?: unknown) {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method, headers: { apikey: key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || data.error || "Authentication failed.");
  return data;
}

function saveAuth(data: Record<string, unknown>): AuthSession {
  const session: AuthSession = {
    access_token: String(data.access_token), refresh_token: String(data.refresh_token),
    expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    user: data.user as AuthSession["user"],
  };
  if (!session.access_token || !session.refresh_token || !session.user?.id) throw new Error("Supabase did not return a complete learning session.");
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export async function signInAnonymously() {
  // Supabase creates a normal auth.users row with an anonymous provider. Its
  // JWT uses the authenticated database role, so the existing RLS policies
  // can keep each browser's learning data scoped to its own user ID.
  return saveAuth(await authFetch("signup", "POST", { data: {} }));
}

export function getOrCreateAuth(): Promise<AuthSession> {
  let saved: AuthSession | null = null;
  try { saved = JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { /* discard malformed local state */ }
  if (saved?.access_token || saved?.refresh_token) {
    return getAuth().then((existing) => {
      if (existing) return existing;
      throw new Error("Couldn't restore this browser's learning session. Check your connection and reload the page.");
    });
  }
  if (!anonymousSessionRequest) {
    anonymousSessionRequest = signInAnonymously().finally(() => { anonymousSessionRequest = null; });
  }
  return anonymousSessionRequest;
}

export async function getAuth(): Promise<AuthSession | null> {
  let session: AuthSession | null;
  try { session = JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { session = null; }
  if (!session?.access_token || !session.refresh_token) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  try { return saveAuth(await authFetch("token?grant_type=refresh_token", "POST", { refresh_token: session.refresh_token })); }
  catch { return null; }
}

export async function db<T>(tableAndQuery: string, options: { method?: string; body?: unknown; token?: string; prefer?: string } = {}): Promise<T> {
  const { url, key } = config();
  const token = options.token || (await getAuth())?.access_token;
  if (!token) throw new Error("Your learning session is unavailable. Reload the page and try again.");
  const response = await fetch(`${url}/rest/v1/${tableAndQuery}`, {
    method: options.method || "GET",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: options.prefer || "return=representation" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.hint || `Database request failed (${response.status}).`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) as T : null as T;
}

export async function serverUser(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" ? { id: user.id as string, token } : null;
}

export async function appPost<T>(path: string, body: unknown): Promise<T> {
  const token = (await getAuth())?.access_token;
  if (!token) throw new Error("Your learning session is unavailable. Reload the page and try again.");
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}
