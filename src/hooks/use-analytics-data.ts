import { useQuery } from "@tanstack/react-query";
import { query } from "@/lib/db";
import { computeAnalytics } from "@/lib/analytics-compute";
import type { ClientRow, StageEventRow, ProfileRow, FollowUpRow, FollowUpLogRow } from "@/lib/analytics-compute";

export function useAnalyticsData(userId?: string | null) {
  return useQuery({
    queryKey: ["analytics-data", "v3", userId],
    queryFn: async () => {
      // Build queries with optional user filtering
      // userId = null means "all data"
      // userId = string means "data this user is associated with"
      
      if (!userId) {
        // "All Data" mode - fetch everything
        const [{ data: clients }, { data: events }, { data: profiles }, { data: followUps }, { data: followUpLogs }] = await Promise.all([
          query('SELECT * FROM clients'),
          query('SELECT * FROM client_stage_events'),
          query('SELECT * FROM profiles'),
          query("SELECT client_id, status FROM client_follow_ups WHERE status = 'active'"),
          query('SELECT follow_up_id, client_id, user_id, activity_type, logged_at FROM public.follow_up_logs'),
        ]);
        
        const rawClients = (clients ?? []) as ClientRow[];
        const rawEvents = (events ?? []) as StageEventRow[];
        const rawProfiles = (profiles ?? []) as ProfileRow[];
        const rawFollowUps = (followUps ?? []) as FollowUpRow[];
        const rawFollowUpLogs = (followUpLogs ?? []) as FollowUpLogRow[];
        
        return {
          ...computeAnalytics(rawClients, rawEvents, rawProfiles, rawFollowUps, rawFollowUpLogs, Date.now(), null),
          _raw: { clients: rawClients, events: rawEvents, profiles: rawProfiles, followUps: rawFollowUps, followUpLogs: rawFollowUpLogs },
        };
      }
      
      // "Your Data" mode - find ALL clients the user is associated with:
      // 1. Clients they created (created_by)
      // 2. Clients they have events on (any stage events)
      // 3. Clients they have follow-ups on
      // 4. Clients they have follow-up logs on
      
      const [{ data: profiles }] = await Promise.all([
        query('SELECT * FROM profiles'),
      ]);
      
      const rawProfiles = (profiles ?? []) as ProfileRow[];
      
      // Get all client IDs where user is involved
      const { data: clientIdsData } = await query(`
        SELECT DISTINCT client_id FROM (
          SELECT id as client_id FROM clients WHERE created_by = $1
          UNION
          SELECT client_id FROM client_stage_events WHERE user_id = $1
          UNION
          SELECT client_id FROM client_follow_ups WHERE user_id = $1
          UNION
          SELECT client_id FROM follow_up_logs WHERE user_id = $1
        ) AS user_clients
      `, [userId]);
      
      const clientIds = ((clientIdsData ?? []) as Array<{ client_id: string }>).map(row => row.client_id);
      
      if (clientIds.length === 0) {
        // No clients associated with this user
        return {
          ...computeAnalytics([], [], rawProfiles, [], [], Date.now(), userId),
          _raw: { clients: [], events: [], profiles: rawProfiles, followUps: [], followUpLogs: [] },
        };
      }
      
      // Fetch all data for these clients
      const [{ data: clients }, { data: events }, { data: followUps }, { data: followUpLogs }] = await Promise.all([
        query('SELECT * FROM clients WHERE id = ANY($1::uuid[])', [clientIds]),
        query('SELECT * FROM client_stage_events WHERE client_id = ANY($1::uuid[])', [clientIds]),
        query("SELECT client_id, status FROM client_follow_ups WHERE status = 'active' AND client_id = ANY($1::uuid[])", [clientIds]),
        query('SELECT follow_up_id, client_id, user_id, activity_type, logged_at FROM public.follow_up_logs WHERE client_id = ANY($1::uuid[])', [clientIds]),
      ]);
      
      const rawClients = (clients ?? []) as ClientRow[];
      const rawEvents = (events ?? []) as StageEventRow[];
      const rawFollowUps = (followUps ?? []) as FollowUpRow[];
      const rawFollowUpLogs = (followUpLogs ?? []) as FollowUpLogRow[];
      
      return {
        ...computeAnalytics(rawClients, rawEvents, rawProfiles, rawFollowUps, rawFollowUpLogs, Date.now(), userId),
        _raw: { clients: rawClients, events: rawEvents, profiles: rawProfiles, followUps: rawFollowUps, followUpLogs: rawFollowUpLogs },
      };
    },
  });
}
