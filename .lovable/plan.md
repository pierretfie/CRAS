# CRAS — Conversion Rate Analytics System

## Stack reality check

Your spec asks for **Node/Express + Prisma + Postgres + JWT/bcrypt + pdflatex + NVIDIA Nemotron**. This Lovable project runs on a different stack:

| Your spec | What I'll build on | Why |
|---|---|---|
| Express / Next API | **TanStack Start** server fns + server routes | Project framework |
| Prisma + raw DATABASE_URL | **Lovable Cloud (Supabase Postgres)** + SQL migrations | Same Postgres, native to platform |
| JWT + bcrypt | **Lovable Cloud Auth** + `user_roles` table + RLS | Secure by default; first-login flow via `must_change_password` flag |
| `pdflatex` shell-out | LaTeX `.tex` download, **or** client-side `jspdf` PDF, **or** external LaTeX API | Cloudflare Worker runtime can't spawn binaries |
| `NVIDIA_API_KEY` in `.env` | Stored as Lovable Cloud secret, used in server fns only | Never reaches the browser |

## Data model (Supabase)

- `profiles` — id (→ auth.users), name, email, department, must_change_password
- `user_roles` — user_id, role ('admin' | 'user'); checked via `has_role()` SECURITY DEFINER
- `admin_categories` — name unique
- `conversion_stage_config` — stage_number unique, label, description
- `clients` — name, email, location, contact_person, category, mode_of_connection, **current_stage**, **stage_value**, stage_label, **status** ('active' | 'won' | 'lost'), **lost_reason**, custom_fields jsonb, created_by, updated_at
- `client_stage_events` — client_id, user_id, from_stage, to_stage, event_type ('progress' | 'regress' | 'note' | 'won' | 'lost'), description, lost_reason, created_at
- `client_interactions` — user_id, client_id, note

RLS: users see clients they created or are linked to; admins see all. Only admins write to config tables.

## Editing & stage updates (new)

- **Edit client details**: `/clients/$id/edit` — same form as create, contact info / category / custom fields editable. Saves a `client_interactions` note "Details updated" with a diff summary.
- **Push a stage update**: dedicated **"Update Stage"** modal on the client detail page:
  - Choose new stage (forward or backward) or mark **Won** / **Lost**.
  - Required free-text description of what happened.
  - On **Lost**: required `lost_reason` (preset list: Price, Timing, Competitor, Unresponsive, Out of scope, Other + free text). Sets `status='lost'`.
  - On **Won**: requires stage 3 with stage_value=1, sets `status='won'`.
  - Every push writes a row to `client_stage_events` and updates `clients.current_stage` / `stage_value` / `status`.
  - AI normalization (Function 1) re-runs on the description to set `stage_value`.
- **Stale-client guardrails**: analytics page surfaces clients with no `client_stage_events` for >30 days and `status='active'`, with a one-click "Mark as Lost" prompt so records don't hang for years.
- Client detail page shows a **timeline** of all stage events (who, when, from→to, description, lost_reason).

## Server functions (NVIDIA Nemotron)

All call `https://integrate.api.nvidia.com/v1` with `nvidia/nemotron-3-super-120b-a12b`, streaming + reasoning, key from `process.env.NVIDIA_API_KEY`.

1. `normalizeClient` — POST server fn; returns normalized `{category, modeOfConnection, stageValue, stageLabel}` for preview.
2. `pushStageUpdate` — POST server fn; validates, normalizes description, writes event + updates client.
3. `/api/chat/report` — streaming server route; messages + injected analytics summary.
4. `/api/chat/admin-console` — streaming, admin-gated.
5. `generateLatexReport` — server fn returning LaTeX source.

## Routes

```
/auth, /change-password
/_authenticated/
  ├── /                  → /analytics
  ├── /clients           list (own; admin sees all) + status filter
  ├── /clients/new       form → AI preview → save
  ├── /clients/$id       detail + timeline + "Update Stage" / "Edit" / "Mark Lost"
  ├── /clients/$id/edit  edit form
  ├── /analytics         8-panel dashboard incl. Stale Clients
  ├── /analytics/report  chat assistant + LaTeX download
  └── /_admin/admin      Users · Categories · Stages · AI Console
```

## UI

- Dark charcoal background, white text, red accent — oklch tokens in `src/styles.css`.
- AI Elements (conversation, message, prompt-input, shimmer) for both chat surfaces.
- Recharts for analytics, red accent series.
- shadcn sidebar; admin link hidden for non-admins.

## Auth & first-login flow

- Admin creates user → server fn calls Supabase Auth admin API with generated temp password, inserts `profiles` with `must_change_password=true`, returns the temp password once.
- Login → if `must_change_password`, force redirect to `/change-password`.
- Roles via `user_roles` + `has_role()`.

## Out of scope / cuts

- No Prisma, no `.env` file, no `pdflatex` server-side.
- Report chat history is session-only as you specified.

---

## Questions before I build

1. **PDF reports**: (a) `.tex` download only, (b) client-side jspdf PDF, or (c) external LaTeX API?
2. **AI provider**: NVIDIA Nemotron isn't on the Lovable AI Gateway. I'll call NVIDIA directly with your `NVIDIA_API_KEY` (you'll add it as a secret when prompted) — confirm, or switch to Lovable AI Gateway (Gemini/GPT)?
3. **Scope**: ship full v1 in one pass, or start with **auth + clients (create/edit/stage-update) + analytics + report chat**, then add admin AI console + LaTeX?
