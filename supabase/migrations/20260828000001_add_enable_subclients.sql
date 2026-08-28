-- Add enable_subclients boolean to admin_categories
ALTER TABLE public.admin_categories
  ADD COLUMN IF NOT EXISTS enable_subclients BOOLEAN NOT NULL DEFAULT false;
