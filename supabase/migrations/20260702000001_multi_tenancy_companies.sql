-- ============================================================
-- Multi-tenancy: introduce companies and scope all data by company
-- ============================================================
-- Overview of changes:
--   1. Create `companies` table
--   2. Extend `app_role` enum with `super_admin`
--   3. Add `company_id` to `user_roles` (roles are now scoped per company)
--   4. Add `company_id` to `profiles` (user belongs to one company)
--   5. Add `company_id` to all data tables
--   6. Backfill existing data into a default company
--   7. Add NOT NULL constraints after backfill
--   8. Add helper functions: my_company_id(), is_company_admin(), is_super_admin()
--   9. Rewrite all RLS policies to enforce company isolation
--  10. Update handle_new_user() trigger to assign company_id
-- ============================================================

-- ── 1. companies ─────────────────────────────────────────────
CREATE TABLE public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,   -- url-safe identifier e.g. "acme-corp"
  industry    TEXT,
  website     TEXT,
  phone       TEXT,
  address     TEXT,
  logo_url    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. extend app_role enum ───────────────────────────────────
-- super_admin = platform owner; can see/manage all companies
-- NOTE: ADD VALUE cannot be used in the same transaction as references to
-- the new value. We add it here and use dynamic SQL (EXECUTE) in any
-- function/policy that references 'super_admin' so Postgres resolves the
-- value at runtime rather than parse time.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- ── 3. add company_id to user_roles ──────────────────────────
-- NULL means the role applies globally (super_admin rows will have NULL)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- ── 4. add company_id to profiles ────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- ── 5. add company_id to data tables ─────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.admin_categories
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.admin_products
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.conversion_stage_config
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- ── 6. backfill: create a default company for existing data ───
DO $$
DECLARE
  default_company_id UUID;
BEGIN
  -- Create the seed company that owns all pre-existing data
  INSERT INTO public.companies (name, slug)
  VALUES ('Default Company', 'default-company')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO default_company_id FROM public.companies WHERE slug = 'default-company';

  -- Assign all existing users to this company
  UPDATE public.profiles SET company_id = default_company_id WHERE company_id IS NULL;

  -- Scope existing user_roles rows to this company (skip if already set)
  -- super_admin is handled separately; for now all existing admins become company admins
  UPDATE public.user_roles SET company_id = default_company_id WHERE company_id IS NULL;

  -- Scope data tables
  UPDATE public.clients          SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.admin_categories SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.admin_products   SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.conversion_stage_config SET company_id = default_company_id WHERE company_id IS NULL;
  UPDATE public.notifications    SET company_id = default_company_id WHERE company_id IS NULL;
END $$;

-- ── 7. NOT NULL constraints after backfill ────────────────────
ALTER TABLE public.profiles           ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.clients            ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.admin_categories   ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.admin_products     ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.conversion_stage_config ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.notifications      ALTER COLUMN company_id SET NOT NULL;
-- user_roles.company_id stays nullable (super_admin rows have NULL)

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_company           ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company            ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company         ON public.user_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_categories_company   ON public.admin_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_products_company     ON public.admin_products(company_id);
CREATE INDEX IF NOT EXISTS idx_conversion_stage_company   ON public.conversion_stage_config(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_company      ON public.notifications(company_id);

-- ── 8. helper functions ───────────────────────────────────────

-- Returns the company_id of the authenticated user (fast, cached per transaction)
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- True if the current user has the 'super_admin' role (platform owner)
-- Uses dynamic SQL so the 'super_admin' enum value is resolved at call-time,
-- not at function-creation time (required when ADD VALUE and usage are in the
-- same transaction/script).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result BOOLEAN;
BEGIN
  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'super_admin'
        AND company_id IS NULL
    )
  $q$ INTO result;
  RETURN COALESCE(result, false);
END;
$$;

-- True if the current user is an admin within their company
CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND company_id = public.my_company_id()
  )
$$;

-- Keep legacy has_role() working — it now checks within the caller's company context
-- Uses dynamic SQL for the 'super_admin' branch (same enum parse-time reason).
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result BOOLEAN;
BEGIN
  EXECUTE $q$
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = $1
        AND role = $2
        AND (
          (role::text = 'super_admin' AND company_id IS NULL)
          OR company_id = public.my_company_id()
        )
    )
  $q$ INTO result USING _user_id, _role;
  RETURN COALESCE(result, false);
END;
$$;

-- ── 9. rewrite RLS policies ───────────────────────────────────

-- ── companies ──
-- Super admin sees all; company admin/users see only their own company
CREATE POLICY "companies_read" ON public.companies FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR id = public.my_company_id()
  );

-- Only super_admin can create new companies (platform provisioning)
-- Company admins can update their own company details
CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "companies_update" ON public.companies FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (id = public.my_company_id() AND public.is_company_admin())
  );

CREATE POLICY "postgres bypass" ON public.companies
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── profiles ──
DROP POLICY IF EXISTS "profiles_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (
    company_id = public.my_company_id()
    OR public.is_super_admin()
  );

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR (company_id = public.my_company_id() AND public.is_company_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR public.is_company_admin()
    OR public.is_super_admin()
  );

-- ── user_roles ──
DROP POLICY IF EXISTS "roles_read" ON public.user_roles;

CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (company_id = public.my_company_id() AND public.is_company_admin())
    OR public.is_super_admin()
  );

-- ── clients ──
DROP POLICY IF EXISTS "clients_read"   ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;

CREATE POLICY "clients_read" ON public.clients FOR SELECT TO authenticated
  USING (
    company_id = public.my_company_id()
    OR public.is_super_admin()
  );

CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (created_by = auth.uid() OR public.is_company_admin())
  );

CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (created_by = auth.uid() OR public.is_company_admin())
  );

-- ── client_interactions ──
DROP POLICY IF EXISTS "interactions_read"   ON public.client_interactions;
DROP POLICY IF EXISTS "interactions_insert" ON public.client_interactions;

CREATE POLICY "interactions_read" ON public.client_interactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_company_admin()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "interactions_insert" ON public.client_interactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.company_id = public.my_company_id()
    )
  );

-- ── client_stage_events ──
DROP POLICY IF EXISTS "events_read"   ON public.client_stage_events;
DROP POLICY IF EXISTS "events_insert" ON public.client_stage_events;

CREATE POLICY "events_read" ON public.client_stage_events FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_company_admin()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "events_insert" ON public.client_stage_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.company_id = public.my_company_id()
    )
  );

-- ── admin_categories ──
DROP POLICY IF EXISTS "categories_read"   ON public.admin_categories;
DROP POLICY IF EXISTS "categories_insert" ON public.admin_categories;
DROP POLICY IF EXISTS "categories_update" ON public.admin_categories;
DROP POLICY IF EXISTS "categories_delete" ON public.admin_categories;

CREATE POLICY "categories_read" ON public.admin_categories FOR SELECT TO authenticated
  USING (
    company_id = public.my_company_id()
    OR public.is_super_admin()
  );

CREATE POLICY "categories_insert" ON public.admin_categories FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

CREATE POLICY "categories_update" ON public.admin_categories FOR UPDATE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

CREATE POLICY "categories_delete" ON public.admin_categories FOR DELETE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

-- ── admin_products ──
DROP POLICY IF EXISTS "products_read"   ON public.admin_products;
DROP POLICY IF EXISTS "products_insert" ON public.admin_products;
DROP POLICY IF EXISTS "products_update" ON public.admin_products;
DROP POLICY IF EXISTS "products_delete" ON public.admin_products;

CREATE POLICY "products_read" ON public.admin_products FOR SELECT TO authenticated
  USING (
    company_id = public.my_company_id()
    OR public.is_super_admin()
  );

CREATE POLICY "products_insert" ON public.admin_products FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

CREATE POLICY "products_update" ON public.admin_products FOR UPDATE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

CREATE POLICY "products_delete" ON public.admin_products FOR DELETE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

-- ── conversion_stage_config ──
DROP POLICY IF EXISTS "stages_read"   ON public.conversion_stage_config;
DROP POLICY IF EXISTS "stages_insert" ON public.conversion_stage_config;
DROP POLICY IF EXISTS "stages_update" ON public.conversion_stage_config;
DROP POLICY IF EXISTS "stages_delete" ON public.conversion_stage_config;

CREATE POLICY "stages_read" ON public.conversion_stage_config FOR SELECT TO authenticated
  USING (
    company_id = public.my_company_id()
    OR public.is_super_admin()
  );

CREATE POLICY "stages_insert" ON public.conversion_stage_config FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

CREATE POLICY "stages_update" ON public.conversion_stage_config FOR UPDATE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

CREATE POLICY "stages_delete" ON public.conversion_stage_config FOR DELETE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (public.is_company_admin() OR public.is_super_admin())
  );

-- ── notifications ──
DROP POLICY IF EXISTS "Users see their own notifications"        ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark their own notifications read"  ON public.notifications;

CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    -- inserter must be in the same company as the recipient
    company_id = public.my_company_id()
  );

CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ── client_follow_ups ──
-- These are already user-scoped; no company_id column needed
-- but restrict inserts to clients within the user's company
DROP POLICY IF EXISTS "Users can insert their own follow-ups"       ON public.client_follow_ups;
DROP POLICY IF EXISTS "follow_ups_insert_company_check"             ON public.client_follow_ups;

CREATE POLICY "follow_ups_insert_company_check" ON public.client_follow_ups
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.company_id = public.my_company_id()
    )
  );

-- ── follow_up_logs ──
DROP POLICY IF EXISTS "Users can insert their own follow-up logs"   ON public.follow_up_logs;
DROP POLICY IF EXISTS "follow_up_logs_insert_company_check"         ON public.follow_up_logs;

CREATE POLICY "follow_up_logs_insert_company_check" ON public.follow_up_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.company_id = public.my_company_id()
    )
  );

-- ── client_access_requests ──
DROP POLICY IF EXISTS "access_requests_read"   ON public.client_access_requests;
DROP POLICY IF EXISTS "access_requests_insert" ON public.client_access_requests;
DROP POLICY IF EXISTS "access_requests_update" ON public.client_access_requests;

CREATE POLICY "access_requests_read" ON public.client_access_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR owner_id = auth.uid()
    OR public.is_company_admin()
    OR public.is_super_admin()
  );

CREATE POLICY "access_requests_insert" ON public.client_access_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.company_id = public.my_company_id()
    )
  );

CREATE POLICY "access_requests_update" ON public.client_access_requests FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.is_company_admin()
    OR public.is_super_admin()
  );

-- ── 10. update handle_new_user() trigger ─────────────────────
-- Now accepts company_id from raw_user_meta_data (passed during invite).
-- The CASE that checks for 'super_admin' uses role::text comparison to
-- avoid a parse-time reference to the new enum value.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id UUID;
  v_role       public.app_role;
BEGIN
  -- Resolve company: passed explicitly, or look up by slug
  v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;

  IF v_company_id IS NULL AND NEW.raw_user_meta_data->>'company_slug' IS NOT NULL THEN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE slug = NEW.raw_user_meta_data->>'company_slug';
  END IF;

  -- Determine role (default: 'user')
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::public.app_role,
    'user'::public.app_role
  );

  -- Create profile
  INSERT INTO public.profiles (id, name, email, department, must_change_password, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'department',
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false),
    v_company_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- Assign role.
  -- For super_admin the company_id should be NULL (global role).
  -- Use v_role::text comparison to avoid a parse-time enum reference.
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (
    NEW.id,
    v_role,
    CASE WHEN v_role::text = 'super_admin' THEN NULL ELSE v_company_id END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

-- ── seed default stage config for the default company ────────
-- The existing seed rows have company_id = default company (set above in backfill).
-- New companies will get their own stage config seeded at company-creation time
-- (handled in application code / edge function).

-- ── postgres bypass (idempotent — drop first in case prior migrations added them) ──
DROP POLICY IF EXISTS "postgres bypass" ON public.follow_up_logs;
DROP POLICY IF EXISTS "postgres bypass" ON public.client_follow_ups;
DROP POLICY IF EXISTS "postgres bypass" ON public.client_stage_events;
DROP POLICY IF EXISTS "postgres bypass" ON public.clients;
DROP POLICY IF EXISTS "postgres bypass" ON public.profiles;
DROP POLICY IF EXISTS "postgres bypass" ON public.notifications;
DROP POLICY IF EXISTS "postgres bypass" ON public.admin_categories;
DROP POLICY IF EXISTS "postgres bypass" ON public.admin_products;
DROP POLICY IF EXISTS "postgres bypass" ON public.conversion_stage_config;

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

CREATE POLICY "postgres bypass" ON public.notifications
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.admin_categories
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.admin_products
  FOR ALL TO postgres USING (true) WITH CHECK (true);

CREATE POLICY "postgres bypass" ON public.conversion_stage_config
  FOR ALL TO postgres USING (true) WITH CHECK (true);
