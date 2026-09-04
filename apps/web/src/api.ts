export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * All mutating requests carry X-Requested-With so the server's CSRF check
 * (defense-in-depth on top of the sameSite=strict session cookie) passes —
 * see apps/server/src/plugins/security.ts.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(method !== "GET" ? { "X-Requested-With": "voting-game" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...init, method, headers, credentials: "same-origin" });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? "UNKNOWN_ERROR", body?.message);
  }
  return body as T;
}

export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });

export const patch = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined });

export const get = <T>(path: string) => api<T>(path);
