-- Add pinned_to_sidebar boolean to admin_categories
ALTER TABLE public.admin_categories
  ADD COLUMN IF NOT EXISTS pinned_to_sidebar BOOLEAN NOT NULL DEFAULT false;
