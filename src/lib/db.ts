import { dbQueryFn } from "./db.fn";

/**
 * Client-safe query function that delegates execution to the server function.
 * Matches the existing query API signature so no other files need changes.
 *
 * @param text - SQL query string
 * @param params - Query parameters
 * @param companyId - Optional company ID for multi-tenant routing.
 *   If provided, routes to that company's database.
 *   If omitted, uses the central database (backward compatible).
 */
export async function query(text: string, params?: any[], companyId?: string | null) {
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
