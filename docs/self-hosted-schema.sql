-- ============================================================
-- CRAS Self-Hosted Database Schema
-- Run this on your PostgreSQL database to provision CRAS.
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
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

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
  UNIQUE (user_id, role, company_id)
);

CREATE INDEX idx_user_roles_company ON public.user_roles(company_id);

-- ── Clients ────────────────────────────────────────────────
CREATE TABLE public.clients (
  id                     UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                   TEXT NOT NULL,
  email                  TEXT,
  location               TEXT,
  contact_person         TEXT,
  contact_person_email   TEXT,
  contact_person_phone   TEXT,
  contact_person_role    TEXT,
  category               TEXT NOT NULL,
  mode_of_connection     TEXT NOT NULL,
  product                TEXT,
  current_stage          INT NOT NULL DEFAULT 1,
  stage_value            INT NOT NULL DEFAULT 0,
  stage_label            TEXT,
  stage_notes            TEXT,
  interest_scale         DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  status                 public.client_status NOT NULL DEFAULT 'active',
  lost_reason            TEXT,
  custom_fields          JSONB NOT NULL DEFAULT '{}'::jsonb,
  parent_client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by             UUID NOT NULL,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pinned_to_sidebar BOOLEAN NOT NULL DEFAULT false,
  enable_subclients BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, company_id)
);

CREATE INDEX idx_admin_categories_company ON public.admin_categories(company_id);

-- ── Admin Products ─────────────────────────────────────────
CREATE TABLE public.admin_products (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, company_id)
);

CREATE INDEX idx_admin_products_company ON public.admin_products(company_id);

-- ── Conversion Stage Config ────────────────────────────────
CREATE TABLE public.conversion_stage_config (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_number INT NOT NULL,
  label        TEXT NOT NULL,
  description  TEXT,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_number, company_id)
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

CREATE INDEX idx_notifications_user_unread
  ON public.notifications(user_id, read, created_at DESC)
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

-- ── Seed: Default Stage Config ─────────────────────────────
-- Seeded per-company by the CRAS server on company creation.
-- Included here as a reference for manual provisioning.
-- INSERT INTO public.conversion_stage_config (stage_number, label, description, company_id) VALUES
--   (1, 'Lead', 'Initial contact established', '<your-company-id>'),
--   (2, 'Engaged', 'Active discussion or proposal stage', '<your-company-id>'),
--   (3, 'Onboarded', 'Client converted and onboarded', '<your-company-id>');
