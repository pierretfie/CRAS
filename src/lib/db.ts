import { dbQueryFn } from "./db.fn";

/**
 * Client-safe query function that delegates execution to the server function.
 * Matches the existing query API signature so no other files need changes.
 */
export async function query(text: string, params?: any[]) {
  try {
    const res = await dbQueryFn({ data: { text, params } });
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
