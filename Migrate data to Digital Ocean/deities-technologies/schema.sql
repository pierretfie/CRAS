--
-- PostgreSQL database dump
--

\restrict uKMB9zwtYHPVpPoJpKIjKd35F1hT1qKAZ9Fx56Jd9MpMeViHPNkRjfLv3Tc4ZED

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Debian 18.4-1+b1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user',
    'super_admin'
);


ALTER TYPE public.app_role OWNER TO postgres;

--
-- Name: client_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.client_status AS ENUM (
    'active',
    'won',
    'lost'
);


ALTER TYPE public.client_status OWNER TO postgres;

--
-- Name: stage_event_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.stage_event_type AS ENUM (
    'progress',
    'regress',
    'note',
    'won',
    'lost'
);


ALTER TYPE public.stage_event_type OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION public.has_role(_user_id uuid, _role public.app_role) OWNER TO postgres;

--
-- Name: is_company_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_company_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND company_id = public.my_company_id()
  )
$$;


ALTER FUNCTION public.is_company_admin() OWNER TO postgres;

--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION public.is_super_admin() OWNER TO postgres;

--
-- Name: my_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.my_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION public.my_company_id() OWNER TO postgres;

--
-- Name: set_client_defaults(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_client_defaults() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() IS NOT NULL then
    new.company_id := my_company_id();
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.set_client_defaults() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    pinned_to_sidebar boolean DEFAULT false NOT NULL,
    enable_subclients boolean DEFAULT false NOT NULL
);


ALTER TABLE public.admin_categories OWNER TO postgres;

--
-- Name: admin_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);


ALTER TABLE public.admin_products OWNER TO postgres;

--
-- Name: client_access_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.client_access_requests OWNER TO postgres;

--
-- Name: client_follow_ups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    frequency text DEFAULT 'daily'::text NOT NULL,
    custom_interval_days integer,
    note text,
    next_reminder timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.client_follow_ups OWNER TO postgres;

--
-- Name: client_interactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.client_interactions OWNER TO postgres;

--
-- Name: client_stage_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_stage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    from_stage integer,
    to_stage integer,
    event_type public.stage_event_type NOT NULL,
    description text NOT NULL,
    lost_reason text,
    stage_value integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_type text,
    interest_scale numeric(3,1)
);


ALTER TABLE public.client_stage_events OWNER TO postgres;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    location text,
    contact_person text,
    category text NOT NULL,
    mode_of_connection text NOT NULL,
    current_stage integer DEFAULT 1 NOT NULL,
    stage_value integer DEFAULT 0 NOT NULL,
    stage_label text,
    stage_notes text,
    status public.client_status DEFAULT 'active'::public.client_status NOT NULL,
    lost_reason text,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_person_email text,
    contact_person_phone text,
    contact_person_role text,
    product text,
    interest_scale numeric(3,1) DEFAULT 5.0 NOT NULL,
    company_id uuid NOT NULL,
    parent_client_id uuid
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    industry text,
    website text,
    phone text,
    address text,
    logo_url text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: conversion_stage_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversion_stage_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_number integer NOT NULL,
    label text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);


ALTER TABLE public.conversion_stage_config OWNER TO postgres;

--
-- Name: follow_up_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.follow_up_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follow_up_id uuid NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid NOT NULL,
    note text,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_type text
);


ALTER TABLE public.follow_up_logs OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    client_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    department text,
    must_change_password boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: admin_categories admin_categories_name_company_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_categories
    ADD CONSTRAINT admin_categories_name_company_unique UNIQUE (name, company_id);


--
-- Name: admin_categories admin_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_categories
    ADD CONSTRAINT admin_categories_pkey PRIMARY KEY (id);


--
-- Name: admin_products admin_products_name_company_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_products
    ADD CONSTRAINT admin_products_name_company_unique UNIQUE (name, company_id);


--
-- Name: admin_products admin_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_products
    ADD CONSTRAINT admin_products_pkey PRIMARY KEY (id);


--
-- Name: client_access_requests client_access_requests_client_id_requester_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_access_requests
    ADD CONSTRAINT client_access_requests_client_id_requester_id_key UNIQUE (client_id, requester_id);


--
-- Name: client_access_requests client_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_access_requests
    ADD CONSTRAINT client_access_requests_pkey PRIMARY KEY (id);


--
-- Name: client_follow_ups client_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_follow_ups
    ADD CONSTRAINT client_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: client_interactions client_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_interactions
    ADD CONSTRAINT client_interactions_pkey PRIMARY KEY (id);


--
-- Name: client_stage_events client_stage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_stage_events
    ADD CONSTRAINT client_stage_events_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: conversion_stage_config conversion_stage_config_company_stage_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion_stage_config
    ADD CONSTRAINT conversion_stage_config_company_stage_unique UNIQUE (company_id, stage_number);


--
-- Name: conversion_stage_config conversion_stage_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion_stage_config
    ADD CONSTRAINT conversion_stage_config_pkey PRIMARY KEY (id);


--
-- Name: follow_up_logs follow_up_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follow_up_logs
    ADD CONSTRAINT follow_up_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: clients_product_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX clients_product_idx ON public.clients USING btree (product);


--
-- Name: idx_access_requests_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_requests_client ON public.client_access_requests USING btree (client_id);


--
-- Name: idx_access_requests_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_requests_owner ON public.client_access_requests USING btree (owner_id, status);


--
-- Name: idx_access_requests_requester; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_access_requests_requester ON public.client_access_requests USING btree (requester_id);


--
-- Name: idx_admin_categories_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_categories_company ON public.admin_categories USING btree (company_id);


--
-- Name: idx_admin_categories_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_categories_company_id ON public.admin_categories USING btree (company_id);


--
-- Name: idx_admin_products_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_products_company ON public.admin_products USING btree (company_id);


--
-- Name: idx_admin_products_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_products_company_id ON public.admin_products USING btree (company_id);


--
-- Name: idx_client_follow_ups_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_follow_ups_client_id ON public.client_follow_ups USING btree (client_id);


--
-- Name: idx_client_follow_ups_next_reminder; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_follow_ups_next_reminder ON public.client_follow_ups USING btree (next_reminder) WHERE (status = 'active'::text);


--
-- Name: idx_client_follow_ups_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_follow_ups_user_id ON public.client_follow_ups USING btree (user_id);


--
-- Name: idx_client_follow_ups_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_follow_ups_user_status ON public.client_follow_ups USING btree (user_id, status);


--
-- Name: idx_client_stage_events_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_client_stage_events_client_id ON public.client_stage_events USING btree (client_id);


--
-- Name: idx_clients_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_company ON public.clients USING btree (company_id);


--
-- Name: idx_clients_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_company_id ON public.clients USING btree (company_id);


--
-- Name: idx_clients_parent_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_clients_parent_client ON public.clients USING btree (parent_client_id);


--
-- Name: idx_conversion_stage_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversion_stage_company ON public.conversion_stage_config USING btree (company_id);


--
-- Name: idx_conversion_stage_config_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversion_stage_config_company_id ON public.conversion_stage_config USING btree (company_id);


--
-- Name: idx_follow_up_logs_activity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_follow_up_logs_activity_type ON public.follow_up_logs USING btree (activity_type) WHERE (activity_type IS NOT NULL);


--
-- Name: idx_follow_up_logs_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_follow_up_logs_client ON public.follow_up_logs USING btree (client_id);


--
-- Name: idx_follow_up_logs_client_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_follow_up_logs_client_id ON public.follow_up_logs USING btree (client_id);


--
-- Name: idx_follow_up_logs_follow_up; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_follow_up_logs_follow_up ON public.follow_up_logs USING btree (follow_up_id);


--
-- Name: idx_follow_up_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_follow_up_logs_user_id ON public.follow_up_logs USING btree (user_id);


--
-- Name: idx_notifications_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_company ON public.notifications USING btree (company_id);


--
-- Name: idx_notifications_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_company_id ON public.notifications USING btree (company_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read, created_at DESC) WHERE (read = false);


--
-- Name: idx_profiles_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_company ON public.profiles USING btree (company_id);


--
-- Name: idx_profiles_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);


--
-- Name: idx_stage_events_activity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stage_events_activity_type ON public.client_stage_events USING btree (activity_type) WHERE (activity_type IS NOT NULL);


--
-- Name: idx_stage_events_client_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_stage_events_client_created ON public.client_stage_events USING btree (client_id, created_at);


--
-- Name: idx_user_roles_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_roles_company ON public.user_roles USING btree (company_id);


--
-- Name: idx_user_roles_company_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_roles_company_id ON public.user_roles USING btree (company_id);


--
-- Name: clients clients_set_defaults; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER clients_set_defaults BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_client_defaults();


--
-- Name: client_access_requests set_access_requests_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_access_requests_updated_at BEFORE UPDATE ON public.client_access_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: client_follow_ups set_client_follow_ups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_client_follow_ups_updated_at BEFORE UPDATE ON public.client_follow_ups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: companies update_companies_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversion_stage_config update_stage_config_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_stage_config_updated_at BEFORE UPDATE ON public.conversion_stage_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_categories admin_categories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_categories
    ADD CONSTRAINT admin_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: admin_products admin_products_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_products
    ADD CONSTRAINT admin_products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: client_access_requests client_access_requests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_access_requests
    ADD CONSTRAINT client_access_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_access_requests client_access_requests_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

-- Self-hosted: profiles is the user table (auth.users is empty externally)
ALTER TABLE ONLY public.client_access_requests
    ADD CONSTRAINT client_access_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_access_requests client_access_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_access_requests
    ADD CONSTRAINT client_access_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_follow_ups client_follow_ups_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_follow_ups
    ADD CONSTRAINT client_follow_ups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_follow_ups client_follow_ups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_follow_ups
    ADD CONSTRAINT client_follow_ups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: client_interactions client_interactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_interactions
    ADD CONSTRAINT client_interactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_interactions client_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_interactions
    ADD CONSTRAINT client_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_stage_events client_stage_events_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_stage_events
    ADD CONSTRAINT client_stage_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_stage_events client_stage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_stage_events
    ADD CONSTRAINT client_stage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: clients clients_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: clients clients_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: clients clients_parent_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_parent_client_id_fkey FOREIGN KEY (parent_client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: conversion_stage_config conversion_stage_config_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion_stage_config
    ADD CONSTRAINT conversion_stage_config_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: follow_up_logs follow_up_logs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follow_up_logs
    ADD CONSTRAINT follow_up_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: follow_up_logs follow_up_logs_follow_up_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follow_up_logs
    ADD CONSTRAINT follow_up_logs_follow_up_id_fkey FOREIGN KEY (follow_up_id) REFERENCES public.client_follow_ups(id) ON DELETE CASCADE;


--
-- Name: follow_up_logs follow_up_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.follow_up_logs
    ADD CONSTRAINT follow_up_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

-- Self-hosted: profiles is standalone (no auth.users FK externally)
-- ALTER TABLE ONLY public.profiles
--     ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: client_follow_ups Users can delete their own follow-ups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own follow-ups" ON public.client_follow_ups FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: client_follow_ups Users can update their own follow-ups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own follow-ups" ON public.client_follow_ups FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: follow_up_logs Users can view their own follow-up logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own follow-up logs" ON public.follow_up_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: client_follow_ups Users can view their own follow-ups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own follow-ups" ON public.client_follow_ups FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: client_access_requests access_requests_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY access_requests_insert ON public.client_access_requests FOR INSERT TO authenticated WITH CHECK (((requester_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_access_requests.client_id) AND (c.company_id = public.my_company_id()))))));


--
-- Name: client_access_requests access_requests_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY access_requests_read ON public.client_access_requests FOR SELECT TO authenticated USING (((requester_id = auth.uid()) OR (owner_id = auth.uid()) OR public.is_company_admin() OR public.is_super_admin()));


--
-- Name: client_access_requests access_requests_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY access_requests_update ON public.client_access_requests FOR UPDATE TO authenticated USING (((owner_id = auth.uid()) OR public.is_company_admin() OR public.is_super_admin()));


--
-- Name: admin_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_products ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_categories categories_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY categories_delete ON public.admin_categories FOR DELETE TO authenticated USING (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: admin_categories categories_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY categories_insert ON public.admin_categories FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: admin_categories categories_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY categories_read ON public.admin_categories FOR SELECT TO authenticated USING (((company_id = public.my_company_id()) OR public.is_super_admin()));


--
-- Name: admin_categories categories_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY categories_update ON public.admin_categories FOR UPDATE TO authenticated USING (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: client_access_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.client_access_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: client_follow_ups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.client_follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: client_interactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: client_stage_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.client_stage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated USING (((company_id = public.my_company_id()) AND ((created_by = auth.uid()) OR public.is_company_admin())));


--
-- Name: clients clients_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company_id()) AND (created_by = auth.uid())));


--
-- Name: clients clients_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY clients_read ON public.clients FOR SELECT TO authenticated USING (((company_id = public.my_company_id()) OR public.is_super_admin()));


--
-- Name: clients clients_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated USING (((company_id = public.my_company_id()) AND ((created_by = auth.uid()) OR public.is_company_admin())));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());


--
-- Name: companies companies_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING ((public.is_super_admin() OR (id = public.my_company_id())));


--
-- Name: companies companies_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((id = public.my_company_id()) AND public.is_company_admin())));


--
-- Name: conversion_stage_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.conversion_stage_config ENABLE ROW LEVEL SECURITY;

--
-- Name: client_stage_events events_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY events_insert ON public.client_stage_events FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_stage_events.client_id) AND (c.company_id = public.my_company_id()))))));


--
-- Name: client_stage_events events_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY events_read ON public.client_stage_events FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_company_admin() OR public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_stage_events.client_id) AND (c.created_by = auth.uid()))))));


--
-- Name: follow_up_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_logs follow_up_logs_insert_company_check; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY follow_up_logs_insert_company_check ON public.follow_up_logs FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = follow_up_logs.client_id) AND (c.company_id = public.my_company_id()))))));


--
-- Name: client_follow_ups follow_ups_insert_company_check; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY follow_ups_insert_company_check ON public.client_follow_ups FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_follow_ups.client_id) AND (c.company_id = public.my_company_id()))))));


--
-- Name: client_interactions interactions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY interactions_insert ON public.client_interactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_interactions.client_id) AND (c.company_id = public.my_company_id()))))));


--
-- Name: client_interactions interactions_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY interactions_read ON public.client_interactions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_company_admin() OR public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = client_interactions.client_id) AND (c.created_by = auth.uid()))))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK ((company_id = public.my_company_id()));


--
-- Name: notifications notifications_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: admin_categories postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.admin_categories TO postgres USING (true) WITH CHECK (true);


--
-- Name: admin_products postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.admin_products TO postgres USING (true) WITH CHECK (true);


--
-- Name: client_follow_ups postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.client_follow_ups TO postgres USING (true) WITH CHECK (true);


--
-- Name: client_stage_events postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.client_stage_events TO postgres USING (true) WITH CHECK (true);


--
-- Name: clients postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.clients TO postgres USING (true) WITH CHECK (true);


--
-- Name: companies postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.companies TO postgres USING (true) WITH CHECK (true);


--
-- Name: conversion_stage_config postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.conversion_stage_config TO postgres USING (true) WITH CHECK (true);


--
-- Name: follow_up_logs postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.follow_up_logs TO postgres USING (true) WITH CHECK (true);


--
-- Name: notifications postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.notifications TO postgres USING (true) WITH CHECK (true);


--
-- Name: profiles postgres bypass; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "postgres bypass" ON public.profiles TO postgres USING (true) WITH CHECK (true);


--
-- Name: admin_products products_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_delete ON public.admin_products FOR DELETE TO authenticated USING (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: admin_products products_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_insert ON public.admin_products FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: admin_products products_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_read ON public.admin_products FOR SELECT TO authenticated USING (((company_id = public.my_company_id()) OR public.is_super_admin()));


--
-- Name: admin_products products_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_update ON public.admin_products FOR UPDATE TO authenticated USING (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (((auth.uid() = id) OR public.is_company_admin() OR public.is_super_admin()));


--
-- Name: profiles profiles_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (((company_id = public.my_company_id()) OR public.is_super_admin()));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (((auth.uid() = id) OR ((company_id = public.my_company_id()) AND public.is_company_admin()) OR public.is_super_admin()));


--
-- Name: user_roles roles_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR ((company_id = public.my_company_id()) AND public.is_company_admin()) OR public.is_super_admin()));


--
-- Name: conversion_stage_config stages_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY stages_delete ON public.conversion_stage_config FOR DELETE TO authenticated USING (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: conversion_stage_config stages_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY stages_insert ON public.conversion_stage_config FOR INSERT TO authenticated WITH CHECK (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: conversion_stage_config stages_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY stages_read ON public.conversion_stage_config FOR SELECT TO authenticated USING (((company_id = public.my_company_id()) OR public.is_super_admin()));


--
-- Name: conversion_stage_config stages_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY stages_update ON public.conversion_stage_config FOR UPDATE TO authenticated USING (((company_id = public.my_company_id()) AND (public.is_company_admin() OR public.is_super_admin())));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION is_company_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_company_admin() TO anon;
GRANT ALL ON FUNCTION public.is_company_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_company_admin() TO service_role;


--
-- Name: FUNCTION is_super_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_super_admin() TO anon;
GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin() TO service_role;


--
-- Name: FUNCTION my_company_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.my_company_id() TO anon;
GRANT ALL ON FUNCTION public.my_company_id() TO authenticated;
GRANT ALL ON FUNCTION public.my_company_id() TO service_role;


--
-- Name: FUNCTION set_client_defaults(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_client_defaults() TO anon;
GRANT ALL ON FUNCTION public.set_client_defaults() TO authenticated;
GRANT ALL ON FUNCTION public.set_client_defaults() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE admin_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_categories TO anon;
GRANT ALL ON TABLE public.admin_categories TO authenticated;
GRANT ALL ON TABLE public.admin_categories TO service_role;


--
-- Name: TABLE admin_products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_products TO anon;
GRANT ALL ON TABLE public.admin_products TO authenticated;
GRANT ALL ON TABLE public.admin_products TO service_role;


--
-- Name: TABLE client_access_requests; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_access_requests TO anon;
GRANT ALL ON TABLE public.client_access_requests TO authenticated;
GRANT ALL ON TABLE public.client_access_requests TO service_role;


--
-- Name: TABLE client_follow_ups; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_follow_ups TO anon;
GRANT ALL ON TABLE public.client_follow_ups TO authenticated;
GRANT ALL ON TABLE public.client_follow_ups TO service_role;


--
-- Name: TABLE client_interactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_interactions TO anon;
GRANT ALL ON TABLE public.client_interactions TO authenticated;
GRANT ALL ON TABLE public.client_interactions TO service_role;


--
-- Name: TABLE client_stage_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.client_stage_events TO anon;
GRANT ALL ON TABLE public.client_stage_events TO authenticated;
GRANT ALL ON TABLE public.client_stage_events TO service_role;


--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clients TO anon;
GRANT ALL ON TABLE public.clients TO authenticated;
GRANT ALL ON TABLE public.clients TO service_role;


--
-- Name: TABLE companies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.companies TO anon;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;


--
-- Name: TABLE conversion_stage_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.conversion_stage_config TO anon;
GRANT ALL ON TABLE public.conversion_stage_config TO authenticated;
GRANT ALL ON TABLE public.conversion_stage_config TO service_role;


--
-- Name: TABLE follow_up_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.follow_up_logs TO anon;
GRANT ALL ON TABLE public.follow_up_logs TO authenticated;
GRANT ALL ON TABLE public.follow_up_logs TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict uKMB9zwtYHPVpPoJpKIjKd35F1hT1qKAZ9Fx56Jd9MpMeViHPNkRjfLv3Tc4ZED

