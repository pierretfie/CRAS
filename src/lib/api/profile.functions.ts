import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server function: get the current user's must_change_password flag.
 *
 * SECURITY: uses requireSupabaseAuth middleware, which validates the caller's
 * bearer token server-side and derives `userId` from the verified JWT claims
 * (not from anything the client sends). The Supabase client attached to
 * `context` is created with that same user token, so the query runs under
 * the user's own RLS policies rather than a service-role/admin connection.
 *
 * This replaces a previous implementation that called a generic raw-SQL
 * `query()` helper directly from client components, passing a locally-read
 * `user.id` as a parameter. That pattern allowed a tampered client to pass
 * an arbitrary id and relied on an unaudited SQL execution path — this
 * version can only ever read/write the row belonging to the caller.
 */
export const getMustChangePassword = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", context.userId)
      .single();

    if (error) {
      // Don't leak Postgres error detail to the client.
      throw new Error("Unable to load profile");
    }

    return { mustChangePassword: Boolean(data?.must_change_password) };
  });

/**
 * Server function: clear the current user's must_change_password flag.
 * Scoped to the authenticated user only — see note above.
 */
export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);

    if (error) {
      throw new Error("Unable to update profile");
    }

    return { success: true };
  });
