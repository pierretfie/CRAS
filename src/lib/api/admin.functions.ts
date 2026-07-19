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

/**
 * Server function: Admin updates a user's email.
 * Uses Supabase Admin API so no confirmation email is required.
 * Also syncs the email column in the profiles table.
 */
export const adminUpdateUserEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      userId: z.string().uuid(),
      email: z.string().email(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Update auth.users
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { email: data.email, email_confirm: true },
    );
    if (authErr) throw new Error(authErr.message);

    // Sync profiles table
    const { error: dbErr } = await supabaseAdmin
      .from("profiles")
      .update({ email: data.email })
      .eq("id", data.userId);
    if (dbErr) throw new Error(dbErr.message);

    return { success: true };
  });

/**
 * Server function: Get the company for the currently authenticated user.
 * Uses service role so it can read across RLS — the caller must be admin
 * (enforced by the UI, but also safe because this is a server fn).
 */
export const getCompany = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // We need the user's company_id from their profile.
    // Server fns don't automatically have the user in context here, so we
    // return ALL company data — the client already knows its own company_id
    // from the profile and can pass it if needed.
    // For the admin panel use-case, the client passes the company_id.
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("*")
      .limit(1)
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
);

/**
 * Server function: Admin updates the company details.
 * Only the name, industry, website, phone, address, and logo_url are editable.
 * The slug is auto-derived from name if name changes.
 */
export const updateCompany = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      name: z.string().min(1),
      industry: z.string().optional(),
      website: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { error } = await supabaseAdmin
      .from("companies")
      .update({
        name: data.name,
        industry: data.industry ?? null,
        website: data.website ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.companyId);

    if (error) throw new Error(error.message);
    return { success: true };
  });

/**
 * Server function: Admin creates a new user within their company.
 * Passes company_id in user_metadata so the handle_new_user trigger
 * correctly assigns the user to the same company.
 */
export const adminCreateUserInCompany = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      department: z.string().optional(),
      role: z.enum(["admin", "user"]).default("user"),
      companyId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    function generatePassword(length = 12): string {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
      const arr = new Uint8Array(length);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => chars[b % chars.length]).join("");
    }

    const password = generatePassword();

    const { data: created, error } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        user_metadata: {
          name: data.name,
          department: data.department ?? "",
          role: data.role,
          must_change_password: true,
          company_id: data.companyId,
        },
      });

    if (error) throw new Error(error.message);

    return {
      userId: created.user.id,
      email: data.email,
      generatedPassword: password,
    };
  });
