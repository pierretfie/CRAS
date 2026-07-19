-- Add activity_type to client_stage_events and follow_up_logs.
--
-- Activity type captures HOW a rep reached out — the method of contact
-- used for each stage update or follow-up check-in. This powers the
-- Activity Metrics KPI (daily call/email/meeting volumes per rep).
--
-- Nullable so all existing rows are unaffected.
-- The UI enforces a value when mode_of_connection = 'Direct Approach'
-- or when logging a follow-up check-in.

ALTER TABLE public.client_stage_events
  ADD COLUMN IF NOT EXISTS activity_type TEXT;

ALTER TABLE public.follow_up_logs
  ADD COLUMN IF NOT EXISTS activity_type TEXT;

-- Index for analytics queries that group by activity type + date
CREATE INDEX IF NOT EXISTS idx_stage_events_activity_type
  ON public.client_stage_events(activity_type)
  WHERE activity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_activity_type
  ON public.follow_up_logs(activity_type)
  WHERE activity_type IS NOT NULL;
