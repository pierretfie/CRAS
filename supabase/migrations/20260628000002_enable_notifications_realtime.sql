-- Enable realtime for the notifications table so clients receive live pushes
-- without needing to refresh the page.
--
-- The client subscribes to all INSERTs on this table and filters by user_id
-- in JavaScript, so REPLICA IDENTITY FULL is NOT required.

-- Add the table to the supabase_realtime publication so change events are
-- broadcast to subscribed clients.
-- NOTE: already applied to the live database on 2026-06-28.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
