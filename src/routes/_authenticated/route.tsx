import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useAIDrawer } from "@/hooks/use-ai-drawer";
import { AIAssistantDrawer } from "@/components/ai-assistant-drawer";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const { toggle } = useAIDrawer();

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: pData } = await query('SELECT must_change_password FROM profiles WHERE id = $1', [u.user.id]);
      const p = (pData as any[])?.length > 0 ? (pData as any[])[0] : null;
      if (p?.must_change_password) {
        navigate({ to: "/change-password" });
        return;
      }
      setChecking(false);
    })();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 flex items-center justify-between border-b px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="font-semibold tracking-tight">CRAS</span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
      <AIAssistantDrawer />
    </SidebarProvider>
  );
}
