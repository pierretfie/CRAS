import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Create server function for executing queries
export const dbQueryFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      text: z.string(),
      params: z.array(z.any()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    // Dynamic import of the server-side DB handler keeps pg and node modules out of the client bundle
    const { queryServer } = await import("./db.server");
    return queryServer(data.text, data.params);
  });

/**
 * Client-safe query function that delegates execution to the server function.
 * Matches the existing query API signature so no other files need changes.
 */
export async function query(text: string, params?: any[]) {
  try {
    const res = await dbQueryFn({ data: { text, params } });
    if (res.error) {
      // Reconstruct the error object on client side using the typed serializable shape
      const err = new Error(res.error.message || "Database query failed");
      if (res.error.stack) err.stack = res.error.stack;
      return { data: null, error: err };
    }
    return { data: res.data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}