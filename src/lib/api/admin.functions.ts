import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Generate a random password: 12 chars, mix of upper/lower/digits/symbols.
 */
function generatePassword(length = 12): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

/**
 * Server function: Admin creates a new user.
 * Uses Supabase Admin API (service role) to create the auth user,
 * which triggers the `handle_new_user` DB trigger to auto-create
 * the profile and role entries.
 */
export const adminCreateUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      department: z.string().optional(),
      role: z.enum(["admin", "user"]).default("user"),
    }),
  )
  .handler(async ({ data }) => {
    // Dynamic import keeps .server.ts out of the client bundle
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const password = generatePassword();

    const { data: created, error } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true, // auto-confirm so user can log in immediately
        user_metadata: {
          name: data.name,
          department: data.department ?? "",
          role: data.role,
          must_change_password: true,
        },
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      userId: created.user.id,
      email: data.email,
      generatedPassword: password,
    };
  });

/**
 * Server function: Admin toggles a user's active status.
 */
export const adminToggleUserActive = createServerFn({ method: "POST" })
  .validator(
    z.object({
      userId: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Update auth user (ban/unban)
    if (!data.active) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        data.userId,
        { ban_duration: "876600h" }, // ~100 years = effectively permanent
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        data.userId,
        { ban_duration: "none" },
      );
      if (error) throw new Error(error.message);
    }

    // Update profile
    const { error: dbErr } = await supabaseAdmin
      .from("profiles")
      .update({ active: data.active })
      .eq("id", data.userId);
    if (dbErr) throw new Error(dbErr.message);

    return { success: true };
  });
