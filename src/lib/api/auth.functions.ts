import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server function: First-run bootstrap admin signup.
 *
 * This is the ONLY public signup path. It:
 *  - Refuses to run if any admin already exists in user_roles (server-side guard).
 *  - Always assigns role = "admin" — this form is exclusively for bootstrapping the
 *    first administrator; subsequent users are created by admins via adminCreateUser.
 */
export const publicSignUp = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      department: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // ── Server-side guard ─────────────────────────────────────────────────────
    // If any admin row already exists, this endpoint must be closed off.
    const { count, error: countErr } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
      throw new Error(
        "An administrator already exists. Use the Sign In tab or contact your admin.",
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { data: created, error } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true, // auto-confirm so they can log in immediately
        user_metadata: {
          name: data.name,
          department: data.department ?? "",
          role: "admin", // bootstrap admin — always
          must_change_password: false,
        },
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      userId: created.user.id,
      email: data.email,
    };
  });

/**
 * Server function: Check whether any admin user exists.
 * Used by the auth page to decide whether to show the Sign Up tab.
 */
export const checkAdminExists = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { count, error } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if (error) throw new Error(error.message);
    return { adminExists: (count ?? 0) > 0 };
  },
);
