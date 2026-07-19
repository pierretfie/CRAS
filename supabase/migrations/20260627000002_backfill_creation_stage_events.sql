-- Backfill initial stage events for clients that were created before the
-- creation event was automatically inserted. Targets clients that have
-- stage_notes recorded but no event with from_stage IS NULL (i.e. no
-- creation event exists yet).

INSERT INTO client_stage_events (
  client_id,
  user_id,
  from_stage,
  to_stage,
  event_type,
  description,
  lost_reason,
  stage_value,
  created_at
)
SELECT
  c.id,
  c.created_by,
  NULL,                  -- from_stage NULL marks this as the creation event
  c.current_stage,
  'progress',
  c.stage_notes,
  NULL,
  c.stage_value,
  c.created_at           -- preserve original creation timestamp
FROM clients c
WHERE
  c.stage_notes IS NOT NULL
  AND c.stage_notes <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM client_stage_events e
    WHERE e.client_id = c.id
      AND e.from_stage IS NULL
  );
