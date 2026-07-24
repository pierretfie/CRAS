import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Converts a company name to a URL-safe slug.
 * e.g. "Acme Corp Ltd." → "acme-corp-ltd"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Ensures the slug is unique in the companies table by appending a counter
 * if needed (e.g. "acme", "acme-2", "acme-3").
 */
async function uniqueSlug(supabaseAdmin: any, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const { count } = await supabaseAdmin
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("slug", slug);
    if ((count ?? 0) === 0) return slug;
    n++;
    slug = `${base}-${n}`;
  }
}

// SECURITY: generic client-facing error message. Internal detail (Postgres
// constraint names, column names, etc.) is logged server-side via
// console.error but never returned to the caller.
const GENERIC_SIGNUP_ERROR =
  "We couldn't create your workspace. Please check your details and try again.";

/**
 * Server function: Public workspace registration.
 *
 * Any visitor can register a new company + admin account. Guards:
 *  - Email uniqueness is enforced by attempting user creation directly and
 *    catching Supabase's own duplicate-email error (see note below).
 *  - Company name uniqueness is handled by slug deduplication (no hard block,
 *    two companies can share a name but get different slugs).
 *
 * On success:
 *  - Creates a new company row.
 *  - Creates the admin user with company_id in user_metadata so the
 *    handle_new_user trigger assigns them to that company.
 *  - Seeds default stage config for the new company.
 *
 * SECURITY NOTES (see accompanying audit):
 *  - This endpoint is public and unauthenticated by design (self-serve
 *    signup). It should sit behind infrastructure-level rate limiting
 *    and/or bot protection (e.g. CAPTCHA/Turnstile) — that is not
 *    something this handler can enforce on its own, since a rate limiter
 *    needs to reject abusive requests before this code even runs.
 *  - email_confirm: true is left in place intentionally so that the
 *    immediate sign-in-after-signup flow in auth.tsx continues to work.
 *    This means email ownership is NOT verified at signup — anyone can
 *    register using an email address they don't control, and that
 *    address will show as "confirmed". If real email verification is
 *    required, this needs a larger change (email_confirm: false, a
 *    verification-pending screen, and a confirmation callback route)
 *    rather than a one-line fix here.
 */
export const publicSignUp = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      department: z.string().optional(),
      companyName: z.string().min(1),
      companyIndustry: z.string().optional(),
      companyWebsite: z.string().url().optional().or(z.literal("")),
      companyPhone: z.string().optional(),
      companyAddress: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // ── Create the company ────────────────────────────────────────────────────
    const slug = await uniqueSlug(supabaseAdmin, toSlug(data.companyName));

    const { data: company, error: companyErr } = await supabaseAdmin
      .from("companies")
      .insert({
        name: data.companyName,
        slug,
        industry: data.companyIndustry ?? null,
        website: data.companyWebsite || null,
        phone: data.companyPhone ?? null,
        address: data.companyAddress ?? null,
      })
      .select("id")
      .single();

    if (companyErr || !company) {
      console.error("[publicSignUp] company insert failed:", companyErr);
      throw new Error(GENERIC_SIGNUP_ERROR);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Create the admin user ─────────────────────────────────────────────────
    // SECURITY: previously, email uniqueness was pre-checked by calling
    // supabaseAdmin.auth.admin.listUsers() and scanning the returned page for
    // a match. listUsers() is paginated (a fixed page size, ~50 by default);
    // once the user base exceeds one page, that scan silently stops seeing
    // users past page 1, so the "guard" degrades to a no-op for a large and
    // growing share of accounts. It also re-fetches and scans the entire
    // (paged) user list on every signup attempt, including bot/abuse traffic.
    //
    // Fix: let createUser enforce uniqueness itself (Supabase auth already
    // guarantees unique emails at the auth.users level) and handle the
    // resulting error, rather than trying to pre-empt it with an unreliable
    // manual scan.
    const { data: created, error: userErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          name: data.name,
          department: data.department ?? "",
          role: "admin",
          must_change_password: false,
          company_id: company.id,
        },
      });

    if (userErr) {
      console.error("[publicSignUp] user creation failed:", userErr);
      // Roll back company row if user creation failed
      await supabaseAdmin.from("companies").delete().eq("id", company.id);

      const isDuplicateEmail =
        userErr.status === 422 ||
        /already.*registered|already.*exists/i.test(userErr.message ?? "");

      throw new Error(
        isDuplicateEmail
          ? "An account with this email already exists. Please sign in instead."
          : GENERIC_SIGNUP_ERROR,
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Seed default stage config for this company ────────────────────────────
    // Check if stages already exist for this company (idempotent)
    const { count } = await supabaseAdmin
      .from("conversion_stage_config")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id);

    if ((count ?? 0) === 0) {
      const { error: stageErr } = await supabaseAdmin
        .from("conversion_stage_config")
        .insert([
          { stage_number: 1, label: "Lead",      description: "Initial contact established",         company_id: company.id },
          { stage_number: 2, label: "Engaged",   description: "Active discussion or proposal stage", company_id: company.id },
          { stage_number: 3, label: "Onboarded", description: "Client converted and onboarded",      company_id: company.id },
        ]);

      if (stageErr) {
        console.error("[publicSignUp] stage config seed failed:", stageErr);
        // Don't roll back — company + user are created, stage config
        // may already exist from a previous attempt or shared table.
        // Log and continue rather than killing the signup.
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    return {
      userId: created.user.id,
      email: data.email,
      companyId: company.id,
    };
  });