import { createFileRoute, Outlet, redirect, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMustChangePassword } from "@/lib/api/profile.functions";
import { getActiveFollowUps } from "@/lib/follow-ups";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, Sparkles, UserCircle } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { requestNotificationPermission, checkOverdueFollowUps } from "@/lib/browser-notifications";
import { useAIDrawer } from "@/hooks/use-ai-drawer";
import { AIAssistantDrawer } from "@/components/ai-assistant-drawer";
import { FollowUpNotifications } from "@/components/follow-up-notifications";
import { NotificationCenter } from "@/components/notification-center";
import { DataScopeProvider } from "@/contexts/data-scope-context";

// ── Idle session timeout ──────────────────────────────────────────────────────
// Signs the user out after IDLE_MS of inactivity (no mouse/keyboard/touch/scroll).
// A 2-minute warning is shown before the timeout fires so the user can stay active.
const IDLE_MS        = 60 * 60 * 1000;  // 1 hour idle → sign out
const WARNING_MS     = 2 * 60 * 1000;   // show warning 2 min before timeout
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

function useIdleTimeout(onTimeout: () => void) {
  const [showWarning, setShowWarning] = useState(false);
  const idleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setShowWarning(false);
    if (idleTimer.current)  clearTimeout(idleTimer.current);
    if (warnTimer.current)  clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setShowWarning(true), IDLE_MS - WARNING_MS);
    idleTimer.current = setTimeout(onTimeout, IDLE_MS);
  }, [onTimeout]);

  useEffect(() => {
    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleTimer.current)  clearTimeout(idleTimer.current);
      if (warnTimer.current)  clearTimeout(warnTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [reset]);

  return { showWarning, resetIdle: reset };
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function useScrollPersistence() {
  const KEY = "cras-scroll-position";

  useEffect(() => {
    // Restore scroll position on mount
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(saved, 10));
      });
    }

    // Save scroll position before unload
    const handleBeforeUnload = () => {
      sessionStorage.setItem(KEY, String(window.scrollY));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Also save on scroll (debounced)
    let timeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sessionStorage.setItem(KEY, String(window.scrollY));
      }, 100);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timeout);
    };
  }, []);
}

function AuthedLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const { toggle } = useAIDrawer();

  useScrollPersistence();

  // Idle timeout — sign out after 1 hr inactivity
  const handleIdleTimeout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
    // Brief delay so navigation completes before we set the flag
    setTimeout(() => sessionStorage.setItem("cras-idle-signout", "1"), 100);
  }, [navigate]);

  const { showWarning, resetIdle } = useIdleTimeout(handleIdleTimeout);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    async function runOverdueCheck() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const followUps = await getActiveFollowUps(user.id);
        checkOverdueFollowUps(followUps);
      } catch {}
    }

    requestNotificationPermission().then((granted: boolean) => {
      if (!granted) return;
      // Check immediately on load, then every 15 minutes
      runOverdueCheck();
      intervalId = setInterval(runOverdueCheck, 15 * 60 * 1000);
    });

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      try {
        // SECURITY: replaces a previous raw query('SELECT must_change_password
        // FROM profiles WHERE id = $1', [u.user.id]) call made directly from
        // this client component. The new server function derives the user id
        // from the verified session token server-side instead of trusting a
        // locally-read id passed from the browser (see profile.functions.ts).
        const { mustChangePassword } = await getMustChangePassword();
        if (mustChangePassword) {
          navigate({ to: "/change-password" });
          return;
        }
      } catch {
        // If the check itself fails, fail open into the app rather than
        // trapping the user — this flag is a UX nudge, not the primary
        // access control (auth is already enforced by beforeLoad above).
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
    <DataScopeProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="flex flex-col flex-1 min-w-0">
            {/* Idle timeout warning banner */}
            {showWarning && (
              <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-4 text-sm text-amber-300">
                <span>⚠️ You've been inactive for a while. You'll be signed out in 2 minutes.</span>
                <Button variant="outline" size="sm" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 h-7 text-xs" onClick={resetIdle}>
                  Stay signed in
                </Button>
              </div>
            )}
            <header className="h-14 flex items-center justify-between border-b px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <span className="font-semibold tracking-tight">CRAS</span>
              </div>
              <div className="flex items-center gap-2">
                <NotificationCenter />
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/profile"><UserCircle className="h-4 w-4" /></Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-1" /> Sign out
                </Button>
              </div>
            </header>
            <main className="flex-1 p-4 md:p-6 xl:px-8">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <AIAssistantDrawer />
      </SidebarProvider>
    </DataScopeProvider>
  );
}