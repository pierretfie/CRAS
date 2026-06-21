-- Track the product a client is interested in / under sale.
-- Nullable so existing rows remain valid; curated list lives in admin_products.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS product text;

-- Admin-managed list of canonical product names. Admins curate, all users select.
CREATE TABLE IF NOT EXISTS public.admin_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_products TO authenticated;
GRANT ALL ON public.admin_products TO service_role;

ALTER TABLE public.admin_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_read"   ON public.admin_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON public.admin_products FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_update" ON public.admin_products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_delete" ON public.admin_products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS clients_product_idx ON clients (product);
