-- Allow the server-side postgres role (used by the direct DB connection / pooler)
-- to bypass RLS on tables that analytics queries need full visibility on.
-- Without this, SELECT via DATABASE_URL returns 0 rows on RLS-enabled tables
-- because the postgres role is subject to RLS in Supabase's hosted environment.

ALTER TABLE public.follow_up_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_follow_ups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;

-- Drop existing postgres bypass policies if they exist (idempotent)
DROP POLICY IF EXISTS "postgres bypass" ON public.follow_up_logs;
DROP POLICY IF EXISTS "postgres bypass" ON public.client_follow_ups;
DROP POLICY IF EXISTS "postgres bypass" ON public.client_stage_events;
DROP POLICY IF EXISTS "postgres bypass" ON public.clients;
DROP POLICY IF EXISTS "postgres bypass" ON public.profiles;

-- Grant full access to the postgres role (server-side analytics, admin ops)
CREATE POLICY "postgres bypass" ON public.follow_up_logs
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.client_follow_ups
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.client_stage_events
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.clients
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.profiles
  FOR ALL TO postgres USING (true) WITH CHECK (true);
