import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { initSupabase, supabase } = await import("@/integrations/supabase/client");
    const client = await initSupabase();
    const { data } = await client.auth.getUser();
    if (data.user) throw redirect({ to: "/analytics" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
