import { useQuery } from "@tanstack/react-query";
import { query } from "@/lib/db";
import { computeAnalytics } from "@/lib/analytics-compute";

export function useAnalyticsData() {
  return useQuery({
    queryKey: ["analytics-data"],
    queryFn: async () => {
      const [{ data: clients }, { data: events }, { data: profiles }] = await Promise.all([
        query('SELECT * FROM clients'),
        query('SELECT * FROM client_stage_events'),
        query('SELECT * FROM profiles'),
      ]);
      return computeAnalytics(clients ?? [], events ?? [], profiles ?? []);
    },
  });
}
