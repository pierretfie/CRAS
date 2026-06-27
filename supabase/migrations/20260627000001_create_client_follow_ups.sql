-- supabase/migrations/20260627000001_create_client_follow_ups.sql
CREATE TABLE client_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  frequency TEXT NOT NULL DEFAULT 'daily',
  custom_interval_days INT,
  note TEXT,
  next_reminder TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON client_follow_ups TO authenticated;

ALTER TABLE client_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own follow-ups"
  ON client_follow_ups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own follow-ups"
  ON client_follow_ups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own follow-ups"
  ON client_follow_ups FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follow-ups"
  ON client_follow_ups FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_client_follow_ups_updated_at
  BEFORE UPDATE ON client_follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_client_follow_ups_user_status ON client_follow_ups(user_id, status);
CREATE INDEX idx_client_follow_ups_next_reminder ON client_follow_ups(next_reminder) WHERE status = 'active';
