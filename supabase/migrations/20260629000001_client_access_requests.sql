-- Client access request system.
-- When user B wants to view or act on a client owned by user A,
-- they submit a request. User A approves or rejects.
-- Approval grants read access by inserting into client_access_grants.

CREATE TABLE client_access_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, requester_id)
);

ALTER TABLE client_access_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON client_access_requests TO authenticated;

-- Requester can see their own requests; owner can see requests for their clients
CREATE POLICY "access_requests_read" ON client_access_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Anyone can submit a request
CREATE POLICY "access_requests_insert" ON client_access_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Only the owner (or admin) can approve/reject
CREATE POLICY "access_requests_update" ON client_access_requests FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_access_requests_updated_at
  BEFORE UPDATE ON client_access_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_access_requests_client ON client_access_requests(client_id);
CREATE INDEX idx_access_requests_owner ON client_access_requests(owner_id, status);
CREATE INDEX idx_access_requests_requester ON client_access_requests(requester_id);

-- ── Widen clients SELECT so ALL authenticated users can see the basic card ──
-- Non-owners only see name/stage/status/category/product — the detail page
-- enforces the access check in the UI and only shows sensitive fields to
-- the owner, approved requesters, and admins.
DROP POLICY IF EXISTS "clients_read" ON clients;

CREATE POLICY "clients_read" ON clients FOR SELECT TO authenticated
  USING (true);  -- every authenticated user can see all client rows
                 -- the UI decides what fields to expose based on ownership
