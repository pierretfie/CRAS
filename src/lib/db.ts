import { dbQueryFn } from "./db.fn";

/**
 * Client-safe query function that delegates execution to the server.
 * If VITE_API_URL is set, calls the remote Fly middleware directly
 * (so local dev/Electron don't need DATABASE_URL).
 * Otherwise falls back to the local TanStack server function.
 */
export async function query(text: string, params?: any[], companyId?: string | null) {
  const apiUrl = (import.meta as any).env?.VITE_API_URL as string | undefined;

  // Remote middleware (Fly) — only on client (browser), server uses local pool
  if (apiUrl && typeof window !== "undefined") {
    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/db`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, params, companyId: companyId ?? null }),
      });
      const json = await res.json();
      if (json.error) {
        const err = new Error(json.error.message || "Database query failed");
        if (json.error.stack) err.stack = json.error.stack;
        return { data: null, error: err };
      }
      return { data: json.data, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  // Local TanStack server function (needs DATABASE_URL locally)
  try {
    const res = await dbQueryFn({ data: { text, params, companyId: companyId ?? null } });
    if (res.error) {
      const err = new Error(res.error.message || "Database query failed");
      if (res.error.stack) err.stack = res.error.stack;
      return { data: null, error: err };
    }
    return { data: res.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
