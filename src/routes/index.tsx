import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { initSupabase } = await import("@/integrations/supabase/client");
      const client = await initSupabase();
      const { data } = await client.auth.getUser();
      if (data.user) throw redirect({ to: "/analytics" });
    } catch (e: any) {
      // Re-throw redirects (they have an options.to property)
      if (e?.options?.to) throw e;
      // Otherwise, init failed — fall through to auth where the user can retry
      console.warn("[CRAS] Index: Supabase init failed, redirecting to auth:", e);
    }
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
