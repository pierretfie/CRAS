import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return null;
      const [{ data: profileData }, { data: rolesData }] = await Promise.all([
        query('SELECT * FROM profiles WHERE id = $1', [data.user.id]),
        query('SELECT role FROM user_roles WHERE user_id = $1', [data.user.id]),
      ]);
      const profile = (profileData as any[])?.length > 0 ? (profileData as any[])[0] : null;
      const roles = (rolesData ?? []) as { role: string }[];
      const isAdmin = roles.some((r) => r.role === "admin");

      // Fetch company details if the user has a company_id
      let company: { id: string; name: string; slug: string; industry?: string; website?: string; phone?: string; address?: string } | null = null;
      if (profile?.company_id) {
        const { data: companyData } = await query(
          'SELECT * FROM companies WHERE id = $1',
          [profile.company_id]
        );
        company = (companyData as any[])?.length > 0 ? (companyData as any[])[0] : null;
      }

      return { user: data.user, profile, isAdmin, company };
    },
  });
}
