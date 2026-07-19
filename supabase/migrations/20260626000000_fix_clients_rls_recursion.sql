-- Fix infinite recursion in clients RLS policies.
--
-- The circular dependency:
--   clients_read  → EXISTS (SELECT 1 FROM client_interactions ...)
--   interactions_read → EXISTS (SELECT 1 FROM clients ...)
-- causes infinite recursion when Supabase evaluates SELECT after INSERT.
--
-- Fix: remove the cross-table EXISTS from both policies. Access is already
-- granted via created_by / user_id / admin role checks.

-- Drop the recursive policies
DROP POLICY IF EXISTS "clients_read" ON public.clients;
DROP POLICY IF EXISTS "interactions_read" ON public.client_interactions;

-- Re-create without cross-table references
CREATE POLICY "clients_read" ON public.clients FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "interactions_read" ON public.client_interactions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );
