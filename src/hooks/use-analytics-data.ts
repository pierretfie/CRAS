import { useQuery } from "@tanstack/react-query";
import { query } from "@/lib/db";
import { computeAnalytics } from "@/lib/analytics-compute";
import type { ClientRow, StageEventRow, ProfileRow, FollowUpRow, FollowUpLogRow } from "@/lib/analytics-compute";

export function useAnalyticsData(userId?: string | null, companyId?: string | null) {
  return useQuery({
    queryKey: ["analytics-data", "v3", userId, companyId],
    queryFn: async () => {
      if (!companyId) {
        return {
          ...computeAnalytics([], [], [], [], [], Date.now(), userId ?? null),
          _raw: { clients: [], events: [], profiles: [], followUps: [], followUpLogs: [] },
        };
      }

      if (!userId) {
        // "All Data" mode — scoped to company
        const [{ data: clients }, { data: events }, { data: profiles }, { data: followUps }, { data: followUpLogs }] = await Promise.all([
          query('SELECT * FROM clients WHERE company_id = $1', [companyId]),
          query('SELECT e.* FROM client_stage_events e JOIN clients c ON c.id = e.client_id WHERE c.company_id = $1', [companyId]),
          query('SELECT * FROM profiles WHERE company_id = $1', [companyId]),
          query("SELECT f.* FROM client_follow_ups f JOIN clients c ON c.id = f.client_id WHERE c.company_id = $1 AND f.status = 'active'", [companyId]),
          query('SELECT l.* FROM follow_up_logs l JOIN clients c ON c.id = l.client_id WHERE c.company_id = $1', [companyId]),
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

      // "Your Data" mode — scoped to company + user
      const [{ data: profiles }] = await Promise.all([
        query('SELECT * FROM profiles WHERE company_id = $1', [companyId]),
      ]);

      const rawProfiles = (profiles ?? []) as ProfileRow[];

      const { data: clientIdsData } = await query(`
        SELECT DISTINCT client_id FROM (
          SELECT id as client_id FROM clients WHERE created_by = $1 AND company_id = $2
          UNION
          SELECT e.client_id FROM client_stage_events e JOIN clients c ON c.id = e.client_id WHERE e.user_id = $1 AND c.company_id = $2
          UNION
          SELECT f.client_id FROM client_follow_ups f JOIN clients c ON c.id = f.client_id WHERE f.user_id = $1 AND c.company_id = $2
          UNION
          SELECT l.client_id FROM follow_up_logs l JOIN clients c ON c.id = l.client_id WHERE l.user_id = $1 AND c.company_id = $2
        ) AS user_clients
      `, [userId, companyId]);

      const clientIds = ((clientIdsData ?? []) as Array<{ client_id: string }>).map(row => row.client_id);

      if (clientIds.length === 0) {
        return {
          ...computeAnalytics([], [], rawProfiles, [], [], Date.now(), userId),
          _raw: { clients: [], events: [], profiles: rawProfiles, followUps: [], followUpLogs: [] },
        };
      }

      const [{ data: clients }, { data: events }, { data: followUps }, { data: followUpLogs }] = await Promise.all([
        query('SELECT * FROM clients WHERE id = ANY($1::uuid[]) AND company_id = $2', [clientIds, companyId]),
        query('SELECT * FROM client_stage_events WHERE client_id = ANY($1::uuid[])', [clientIds]),
        query("SELECT client_id, status FROM client_follow_ups WHERE status = 'active' AND client_id = ANY($1::uuid[])", [clientIds]),
        query('SELECT follow_up_id, client_id, user_id, activity_type, logged_at FROM follow_up_logs WHERE client_id = ANY($1::uuid[])', [clientIds]),
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
