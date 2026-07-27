-- Scope product & category name uniqueness to company (multi-tenancy).
-- Without this, two companies cannot use the same product/category name.

-- Products
ALTER TABLE public.admin_products
  DROP CONSTRAINT IF EXISTS admin_products_name_key;
ALTER TABLE public.admin_products
  DROP CONSTRAINT IF EXISTS admin_products_name_company_unique;
ALTER TABLE public.admin_products
  ADD CONSTRAINT admin_products_name_company_unique UNIQUE (name, company_id);

-- Categories
ALTER TABLE public.admin_categories
  DROP CONSTRAINT IF EXISTS admin_categories_name_key;
ALTER TABLE public.admin_categories
  DROP CONSTRAINT IF EXISTS admin_categories_name_company_unique;
ALTER TABLE public.admin_categories
  ADD CONSTRAINT admin_categories_name_company_unique UNIQUE (name, company_id);
