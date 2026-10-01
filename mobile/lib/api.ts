import { supabase } from "./supabase";

export const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL ?? "https://styleai-backend-5vk9.onrender.com").replace(
    /\/$/,
    ""
  );

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail?.message ?? j.detail ?? text;
    } catch {
      /* keep text */
    }
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`${API_BASE}${path}`, { headers: await authHeader() }));
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    })
  );
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return handle<T>(
    await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: await authHeader(),
      body: formData,
    })
  );
}

export async function apiDelete<T>(path: string): Promise<T> {
  return handle<T>(
    await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: await authHeader() })
  );
}
