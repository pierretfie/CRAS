import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", data.user.id),
      ]);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      return { user: data.user, profile, isAdmin };
    },
  });
}
