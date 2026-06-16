
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.client_status AS ENUM ('active', 'won', 'lost');
CREATE TYPE public.stage_event_type AS ENUM ('progress', 'regress', 'note', 'won', 'lost');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.conversion_stage_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_number INT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  location TEXT,
  contact_person TEXT,
  category TEXT NOT NULL,
  mode_of_connection TEXT NOT NULL,
  current_stage INT NOT NULL DEFAULT 1,
  stage_value INT NOT NULL DEFAULT 0,
  stage_label TEXT,
  stage_notes TEXT,
  status public.client_status NOT NULL DEFAULT 'active',
  lost_reason TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.client_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.client_stage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_stage INT,
  to_stage INT,
  event_type public.stage_event_type NOT NULL,
  description TEXT NOT NULL,
  lost_reason TEXT,
  stage_value INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_categories TO authenticated;
GRANT ALL ON public.admin_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversion_stage_config TO authenticated;
GRANT ALL ON public.conversion_stage_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_interactions TO authenticated;
GRANT ALL ON public.client_interactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_stage_events TO authenticated;
GRANT ALL ON public.client_stage_events TO service_role;

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_stage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_stage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_read" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "categories_read" ON public.admin_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_insert" ON public.admin_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "categories_update" ON public.admin_categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "categories_delete" ON public.admin_categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stages_read" ON public.conversion_stage_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "stages_insert" ON public.conversion_stage_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "stages_update" ON public.conversion_stage_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "stages_delete" ON public.conversion_stage_config FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "clients_read" ON public.clients FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.client_interactions ci WHERE ci.client_id = clients.id AND ci.user_id = auth.uid())
  );
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "interactions_read" ON public.client_interactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.created_by = auth.uid())
  );
CREATE POLICY "interactions_insert" ON public.client_interactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "events_read" ON public.client_stage_events FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.client_interactions ci WHERE ci.client_id = client_id AND ci.user_id = auth.uid())
  );
CREATE POLICY "events_insert" ON public.client_stage_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stage_config_updated_at BEFORE UPDATE ON public.conversion_stage_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, department, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'department',
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false)
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'user'::public.app_role))
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed
INSERT INTO public.conversion_stage_config (stage_number, label, description) VALUES
  (1, 'Lead', 'Initial contact established'),
  (2, 'Engaged', 'Active discussion or proposal stage'),
  (3, 'Onboarded', 'Client converted and onboarded')
ON CONFLICT (stage_number) DO NOTHING;

INSERT INTO public.admin_categories (name) VALUES
  ('Consulting'), ('Software'), ('Marketing'), ('Other')
ON CONFLICT (name) DO NOTHING;
