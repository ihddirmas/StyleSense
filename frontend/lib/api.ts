import { getSupabaseBrowser } from "@/lib/supabase/client";
import { resolveApiBase } from "@/lib/api-base";

const API_BASE = resolveApiBase();

async function authHeader(): Promise<Record<string, string>> {
  // Browser-side only. Server components shouldn't call these helpers.
  if (typeof window === "undefined") return {};
  const supabase = getSupabaseBrowser();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail?.message ?? j.detail ?? text;
    } catch {
      // leave as text
    }
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }
  // Empty body (DELETE)
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeader();
  return handle<T>(await fetch(`${API_BASE}${path}`, { headers }));
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  return handle<T>(
    await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) })
  );
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await authHeader();
  return handle<T>(await fetch(`${API_BASE}${path}`, { method: "DELETE", headers }));
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  return handle<T>(
    await fetch(`${API_BASE}${path}`, { method: "PUT", headers, body: JSON.stringify(body) })
  );
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const headers = await authHeader();
  return handle<T>(await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData }));
}

export { API_BASE };
