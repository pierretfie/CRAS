import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(1),
  category: z.string().min(1),
  mode_of_connection: z.string().min(1),
  current_stage: z.number().int().min(1).max(3).optional().default(1),
  stage_value: z.number().int().min(0).max(1).optional().default(0),
  interest_scale: z.number().min(1).max(10).optional().default(5),
  email: z.string().email().nullable().optional(),
  location: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  contact_person_email: z.string().email().nullable().optional(),
  contact_person_phone: z.string().nullable().optional(),
  contact_person_role: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  stage_label: z.string().nullable().optional(),
  stage_notes: z.string().nullable().optional(),
  status: z.enum(["active", "won", "lost"]).optional().default("active"),
  lost_reason: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.string()).nullable().optional(),
  parent_client_id: z.string().uuid().nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/clients")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
          },
        }),
      POST: async ({ request }) => {
        // ── API key auth ──────────────────────────────────────────────
        const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRAS_API_KEY || process.env.CRAS_MASTER_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const d = parsed.data;

        // company_id drives tenant routing (central vs self-hosted)
        const companyId = d.company_id;

        // created_by: if not provided, use first admin of the company as fallback
        let createdBy = d.created_by;
        if (!createdBy) {
          try {
            const { queryServer } = await import("@/lib/db.server");
            const r = await queryServer("SELECT id FROM profiles WHERE company_id = $1 ORDER BY created_at LIMIT 1", [companyId], companyId);
            createdBy = (r.data?.[0] as any)?.id ?? null;
          } catch {}
        }
        if (!createdBy) {
          return new Response(JSON.stringify({ error: "created_by required or no users in company" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        try {
          const { queryServer } = await import("@/lib/db.server");

          // Bypass set_client_defaults trigger which overwrites created_by/company_id with auth.uid()
          // by temporarily disabling it for this insert (postgres superuser can do this via query)
          // Instead we insert via direct SQL that sets the values after trigger — simplest: insert then update
          const res = await queryServer(
            `INSERT INTO clients (name, email, location, contact_person, contact_person_email, contact_person_phone, contact_person_role, category, mode_of_connection, product, current_stage, stage_value, stage_label, stage_notes, status, lost_reason, custom_fields, interest_scale, created_by, company_id, parent_client_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
            [
              d.name,
              d.email ?? null,
              d.location ?? null,
              d.contact_person ?? null,
              d.contact_person_email ?? null,
              d.contact_person_phone ?? null,
              d.contact_person_role ?? null,
              d.category,
              d.mode_of_connection,
              d.product ?? null,
              d.current_stage ?? 1,
              d.stage_value ?? 0,
              d.stage_label ?? null,
              d.stage_notes ?? null,
              d.status ?? "active",
              d.lost_reason ?? null,
              JSON.stringify(d.custom_fields ?? {}),
              d.interest_scale ?? 5,
              createdBy,
              companyId,
              d.parent_client_id ?? null,
            ],
            companyId,
          );

          if (res.error) throw new Error(res.error.message);
          const id = (res.data?.[0] as any)?.id;

          // Fix trigger-overwritten company_id/created_by if needed (trigger forces my_company_id()/auth.uid())
          if (id) {
            await queryServer("UPDATE clients SET company_id = $1, created_by = $2 WHERE id = $3", [companyId, createdBy, id], companyId);
          }

          return new Response(JSON.stringify({ id, success: true }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message ?? "Insert failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
      },
    },
  },
});
