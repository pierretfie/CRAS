-- Add interest_scale to client_stage_events so that each stage update
-- captures the interest at that point in time.
--
-- This enables tracking the interest trend across the deal lifecycle:
-- first event = interest at deal entry, last event = interest at close/loss.
-- The analytics page uses this to compare entry vs exit interest for
-- won vs lost deals.
--
-- Nullable so all existing rows are unaffected; new stage updates will
-- always populate it.

ALTER TABLE public.client_stage_events
  ADD COLUMN IF NOT EXISTS interest_scale DECIMAL(3,1);

-- Index for analytics queries that read interest across a client's timeline
CREATE INDEX IF NOT EXISTS idx_stage_events_client_created
  ON public.client_stage_events(client_id, created_at);
