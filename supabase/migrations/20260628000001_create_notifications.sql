-- In-app notification inbox.
-- Each row is one notification for one user.
-- Admin-broadcast events get one row per admin user.
-- Follow-up reminders are handled separately in client_follow_ups.

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,        -- 'new_client' | 'stage_progress' | 'client_won' | 'client_lost'
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;

CREATE POLICY "Users see their own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can mark their own notifications read"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC)
  WHERE read = false;
