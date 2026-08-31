-- ============================================================
-- CRAS Self-Hosted Database Schema
-- Run this on your PostgreSQL database to provision CRAS.
-- Source of truth: live Supabase schema dump (2026-08-31)
-- ============================================================
-- Requirements: PostgreSQL 14+ (tested on 17.6)
-- ============================================================

-- ── Extensions ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Types ──────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'super_admin');
CREATE TYPE public.client_status AS ENUM ('active', 'won', 'lost');
CREATE TYPE public.stage_event_type AS ENUM ('progress', 'regress', 'note', 'won', 'lost');

-- ── Helper: auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── Helper: my_company_id() ────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ── Helper: is_company_admin() ─────────────────────────────
CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND company_id = public.my_company_id()
  )
$$;

-- ── Helper: is_super_admin() ───────────────────────────────
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

-- ── Helper: has_role() ─────────────────────────────────────
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

-- ── Helper: set_client_defaults() ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_client_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.company_id := my_company_id();
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

-- ── Companies ──────────────────────────────────────────────
CREATE TABLE public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  industry    TEXT,
  website     TEXT,
  phone       TEXT,
  address     TEXT,
  logo_url    TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Profiles ───────────────────────────────────────────────
CREATE TABLE public.profiles (
  id                   UUID NOT NULL PRIMARY KEY,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  department           TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  active               BOOLEAN NOT NULL DEFAULT true,
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_profiles_company ON public.profiles(company_id);

-- ── User Roles ─────────────────────────────────────────────
CREATE TABLE public.user_roles (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  role       public.app_role NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_company ON public.user_roles(company_id);

-- ── Clients ────────────────────────────────────────────────
CREATE TABLE public.clients (
  id                     UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                   TEXT NOT NULL,
  email                  TEXT,
  location               TEXT,
  contact_person         TEXT,
  category               TEXT NOT NULL,
  mode_of_connection     TEXT NOT NULL,
  current_stage          INT NOT NULL DEFAULT 1,
  stage_value            INT NOT NULL DEFAULT 0,
  stage_label            TEXT,
  stage_notes            TEXT,
  interest_scale         DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  status                 public.client_status NOT NULL DEFAULT 'active',
  lost_reason            TEXT,
  custom_fields          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by             UUID NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  contact_person_email   TEXT,
  contact_person_phone   TEXT,
  contact_person_role    TEXT,
  product                TEXT,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parent_client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL
);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER clients_set_defaults
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_client_defaults();

CREATE INDEX idx_clients_company ON public.clients(company_id);
CREATE INDEX idx_clients_product ON public.clients(product);
CREATE INDEX idx_clients_parent_client ON public.clients(parent_client_id);

-- ── Client Interactions ────────────────────────────────────
CREATE TABLE public.client_interactions (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  client_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_interactions_client ON public.client_interactions(client_id);

-- ── Client Stage Events ────────────────────────────────────
CREATE TABLE public.client_stage_events (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id      UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  from_stage     INT,
  to_stage       INT,
  event_type     public.stage_event_type NOT NULL,
  description    TEXT NOT NULL,
  lost_reason    TEXT,
  stage_value    INT,
  activity_type  TEXT,
  interest_scale DECIMAL(3,1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stage_events_activity_type
  ON public.client_stage_events(activity_type)
  WHERE activity_type IS NOT NULL;

CREATE INDEX idx_stage_events_client_created
  ON public.client_stage_events(client_id, created_at);

-- ── Admin Categories ───────────────────────────────────────
CREATE TABLE public.admin_categories (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pinned_to_sidebar BOOLEAN NOT NULL DEFAULT false,
  enable_subclients BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (name, company_id)
);

CREATE INDEX idx_admin_categories_company ON public.admin_categories(company_id);

-- ── Admin Products ─────────────────────────────────────────
CREATE TABLE public.admin_products (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  UNIQUE (name, company_id)
);

CREATE INDEX idx_admin_products_company ON public.admin_products(company_id);

-- ── Conversion Stage Config ────────────────────────────────
CREATE TABLE public.conversion_stage_config (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_number INT NOT NULL,
  label        TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  UNIQUE (company_id, stage_number)
);

CREATE TRIGGER update_stage_config_updated_at
  BEFORE UPDATE ON public.conversion_stage_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_conversion_stage_company ON public.conversion_stage_config(company_id);

-- ── Client Follow-ups ──────────────────────────────────────
CREATE TABLE public.client_follow_ups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL,
  frequency           TEXT NOT NULL DEFAULT 'daily',
  custom_interval_days INT,
  note                TEXT,
  next_reminder       TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_client_follow_ups_updated_at
  BEFORE UPDATE ON public.client_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_client_follow_ups_user_status ON public.client_follow_ups(user_id, status);
CREATE INDEX idx_client_follow_ups_next_reminder ON public.client_follow_ups(next_reminder) WHERE status = 'active';
CREATE INDEX idx_client_follow_ups_client_id ON public.client_follow_ups(client_id);
CREATE INDEX idx_client_follow_ups_user_id ON public.client_follow_ups(user_id);

-- ── Follow-up Logs ─────────────────────────────────────────
CREATE TABLE public.follow_up_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id  UUID NOT NULL REFERENCES public.client_follow_ups(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  note          TEXT,
  activity_type TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_follow_up_logs_client ON public.follow_up_logs(client_id);
CREATE INDEX idx_follow_up_logs_follow_up ON public.follow_up_logs(follow_up_id);
CREATE INDEX idx_follow_up_logs_user_id ON public.follow_up_logs(user_id);
CREATE INDEX idx_follow_up_logs_activity_type
  ON public.follow_up_logs(activity_type)
  WHERE activity_type IS NOT NULL;

-- ── Notifications ──────────────────────────────────────────
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  client_id   UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC)
  WHERE read = false;

CREATE INDEX idx_notifications_company ON public.notifications(company_id);

-- ── Client Access Requests ─────────────────────────────────
CREATE TABLE public.client_access_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
  owner_id     UUID NOT NULL,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, requester_id)
);

CREATE TRIGGER set_access_requests_updated_at
  BEFORE UPDATE ON public.client_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_access_requests_client ON public.client_access_requests(client_id);
CREATE INDEX idx_access_requests_owner ON public.client_access_requests(owner_id, status);
CREATE INDEX idx_access_requests_requester ON public.client_access_requests(requester_id);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- These protect data when accessed via PostgREST/Supabase client.
-- When CRAS server connects as postgres role, RLS is bypassed.
-- ============================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_stage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_access_requests ENABLE ROW LEVEL SECURITY;

-- ── companies ──
CREATE POLICY "companies_read" ON public.companies FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.my_company_id());
CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY "companies_update" ON public.companies FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (id = public.my_company_id() AND public.is_company_admin()));
CREATE POLICY "postgres bypass" ON public.companies
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── profiles ──
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (company_id = public.my_company_id() OR public.is_super_admin());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR (company_id = public.my_company_id() AND public.is_company_admin()) OR public.is_super_admin());
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.is_company_admin() OR public.is_super_admin());
CREATE POLICY "postgres bypass" ON public.profiles
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── user_roles ──
CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (company_id = public.my_company_id() AND public.is_company_admin()) OR public.is_super_admin());

-- ── clients ──
CREATE POLICY "clients_read" ON public.clients FOR SELECT TO authenticated
  USING (company_id = public.my_company_id() OR public.is_super_admin());
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (company_id = public.my_company_id() AND created_by = auth.uid());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (company_id = public.my_company_id() AND (created_by = auth.uid() OR public.is_company_admin()));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING (company_id = public.my_company_id() AND (created_by = auth.uid() OR public.is_company_admin()));
CREATE POLICY "postgres bypass" ON public.clients
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── client_interactions ──
CREATE POLICY "interactions_read" ON public.client_interactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin() OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.created_by = auth.uid()));
CREATE POLICY "interactions_insert" ON public.client_interactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.company_id = public.my_company_id()));
CREATE POLICY "postgres bypass" ON public.client_interactions
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── client_stage_events ──
CREATE POLICY "events_read" ON public.client_stage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin() OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.created_by = auth.uid()));
CREATE POLICY "events_insert" ON public.client_stage_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.company_id = public.my_company_id()));
CREATE POLICY "postgres bypass" ON public.client_stage_events
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── admin_categories ──
CREATE POLICY "categories_read" ON public.admin_categories FOR SELECT TO authenticated
  USING (company_id = public.my_company_id() OR public.is_super_admin());
CREATE POLICY "categories_insert" ON public.admin_categories FOR INSERT TO authenticated
  WITH CHECK (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "categories_update" ON public.admin_categories FOR UPDATE TO authenticated
  USING (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "categories_delete" ON public.admin_categories FOR DELETE TO authenticated
  USING (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "postgres bypass" ON public.admin_categories
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── admin_products ──
CREATE POLICY "products_read" ON public.admin_products FOR SELECT TO authenticated
  USING (company_id = public.my_company_id() OR public.is_super_admin());
CREATE POLICY "products_insert" ON public.admin_products FOR INSERT TO authenticated
  WITH CHECK (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "products_update" ON public.admin_products FOR UPDATE TO authenticated
  USING (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "products_delete" ON public.admin_products FOR DELETE TO authenticated
  USING (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "postgres bypass" ON public.admin_products
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── conversion_stage_config ──
CREATE POLICY "stages_read" ON public.conversion_stage_config FOR SELECT TO authenticated
  USING (company_id = public.my_company_id() OR public.is_super_admin());
CREATE POLICY "stages_insert" ON public.conversion_stage_config FOR INSERT TO authenticated
  WITH CHECK (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "stages_update" ON public.conversion_stage_config FOR UPDATE TO authenticated
  USING (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "stages_delete" ON public.conversion_stage_config FOR DELETE TO authenticated
  USING (company_id = public.my_company_id() AND (public.is_company_admin() OR public.is_super_admin()));
CREATE POLICY "postgres bypass" ON public.conversion_stage_config
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── client_follow_ups ──
CREATE POLICY "Users can view their own follow-ups" ON public.client_follow_ups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own follow-ups" ON public.client_follow_ups FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own follow-ups" ON public.client_follow_ups FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "follow_ups_insert_company_check" ON public.client_follow_ups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.company_id = public.my_company_id()));
CREATE POLICY "postgres bypass" ON public.client_follow_ups
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── follow_up_logs ──
CREATE POLICY "Users can view their own follow-up logs" ON public.follow_up_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "follow_up_logs_insert_company_check" ON public.follow_up_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.company_id = public.my_company_id()));
CREATE POLICY "postgres bypass" ON public.follow_up_logs
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── notifications ──
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (company_id = public.my_company_id());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "postgres bypass" ON public.notifications
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ── client_access_requests ──
CREATE POLICY "access_requests_read" ON public.client_access_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR owner_id = auth.uid() OR public.is_company_admin() OR public.is_super_admin());
CREATE POLICY "access_requests_insert" ON public.client_access_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.company_id = public.my_company_id()));
CREATE POLICY "access_requests_update" ON public.client_access_requests FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_company_admin() OR public.is_super_admin());
CREATE POLICY "postgres bypass" ON public.client_access_requests
  FOR ALL TO postgres USING (true) WITH CHECK (true);

-- ============================================================
-- GRANTS
-- CRAS server connects as postgres (bypasses RLS).
-- Only authenticated and service_role need table access.
-- anon role excluded — no unauthenticated access to business data.
-- ============================================================

GRANT USAGE ON SCHEMA public TO postgres, authenticated, service_role;

GRANT ALL ON TABLE public.companies TO authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO authenticated, service_role;
GRANT ALL ON TABLE public.user_roles TO authenticated, service_role;
GRANT ALL ON TABLE public.clients TO authenticated, service_role;
GRANT ALL ON TABLE public.client_interactions TO authenticated, service_role;
GRANT ALL ON TABLE public.client_stage_events TO authenticated, service_role;
GRANT ALL ON TABLE public.admin_categories TO authenticated, service_role;
GRANT ALL ON TABLE public.admin_products TO authenticated, service_role;
GRANT ALL ON TABLE public.conversion_stage_config TO authenticated, service_role;
GRANT ALL ON TABLE public.client_follow_ups TO authenticated, service_role;
GRANT ALL ON TABLE public.follow_up_logs TO authenticated, service_role;
GRANT ALL ON TABLE public.notifications TO authenticated, service_role;
GRANT ALL ON TABLE public.client_access_requests TO authenticated, service_role;

GRANT ALL ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT ALL ON FUNCTION public.is_company_admin() TO authenticated, service_role;
GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT ALL ON FUNCTION public.my_company_id() TO authenticated, service_role;
GRANT ALL ON FUNCTION public.set_client_defaults() TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, authenticated, service_role;
