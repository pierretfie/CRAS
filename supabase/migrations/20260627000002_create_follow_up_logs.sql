-- Track each individual "followed up today" check-in.
-- This lets users see a history of when they actually contacted a client,
-- while the parent follow_up row stays active and reschedules itself.
CREATE TABLE follow_up_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id UUID NOT NULL REFERENCES client_follow_ups(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON follow_up_logs TO authenticated;

ALTER TABLE follow_up_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own follow-up logs"
  ON follow_up_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own follow-up logs"
  ON follow_up_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_follow_up_logs_client ON follow_up_logs(client_id);
CREATE INDEX idx_follow_up_logs_follow_up ON follow_up_logs(follow_up_id);
