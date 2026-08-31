-- Add connection_string to companies for multi-tenant routing
-- NULL = hosted by CRAS (use central database)
-- Has value = self-hosted (connect to their database)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS connection_string TEXT;
