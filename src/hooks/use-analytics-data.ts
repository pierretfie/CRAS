import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeAnalytics } from "@/lib/analytics-compute";

export function useAnalyticsData() {
  return useQuery({
    queryKey: ["analytics-data"],
    queryFn: async () => {
      const [{ data: clients }, { data: events }, { data: profiles }] = await Promise.all([
        supabase.from("clients").select("*"),
        supabase.from("client_stage_events").select("*"),
        supabase.from("profiles").select("*"),
      ]);
      return computeAnalytics(clients ?? [], events ?? [], profiles ?? []);
    },
  });
}
