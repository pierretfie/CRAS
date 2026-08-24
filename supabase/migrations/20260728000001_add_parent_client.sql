-- Allow clients to be linked to a parent client (referral relationship).
-- e.g. Client A brought Client B → B.parent_client_id = A.id

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS parent_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_parent_client
  ON public.clients(parent_client_id);
