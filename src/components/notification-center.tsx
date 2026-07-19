import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, ArrowRight, CheckCheck, UserPlus, TrendingUp, Trophy, XCircle, Lock, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useNavigate } from "@tanstack/react-router";
import notificationSound from "@/assets/notification.wav";
import { toast } from "sonner";
import { type FollowUp } from "@/lib/follow-ups";
import {
  markNotificationRead, markAllNotificationsRead, type AppNotification,
} from "@/lib/notify";

// ── Types ──────────────────────────────────────────────────────────────────

interface FollowUpWithClient extends FollowUp {
  clients: {
    name: string;
    product: string | null;
    current_stage: number;
    interest_scale: number | null;
    created_by_name: string | null;
    created_by_dept: string | null;
  } | null;
}

// ── Icon map for notification types ───────────────────────────────────────

function NotifIcon({ type }: { type: string }) {
  const cls = "h-4 w-4 shrink-0 mt-0.5";
  switch (type) {
    case "new_client":      return <UserPlus className={`${cls} text-blue-400`} />;
    case "stage_progress":  return <TrendingUp className={`${cls} text-amber-400`} />;
    case "client_won":      return <Trophy className={`${cls} text-green-400`} />;
    case "client_lost":     return <XCircle className={`${cls} text-red-400`} />;
    case "access_request":  return <Lock className={`${cls} text-amber-400`} />;
    case "access_approved": return <ShieldCheck className={`${cls} text-green-400`} />;
    case "access_rejected": return <ShieldOff className={`${cls} text-red-400`} />;
    default:                return <Bell className={`${cls} text-muted-foreground`} />;
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export function NotificationCenter() {
  const { u } = useAuth();
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Pre-load the notification sound once
  useEffect(() => {
    audioRef.current = new Audio(notificationSound);
    audioRef.current.volume = 0.6;
  }, []);

  // System notifications (new client / stage / won / lost)
  const [notifs, setNotifs] = useState<AppNotification[]>([]);

  // Follow-ups
  const [followUps, setFollowUps] = useState<FollowUpWithClient[]>([]);

  const userId = u?.user?.id;

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchNotifs = useCallback(() => {
    if (!userId) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => setNotifs((data ?? []) as AppNotification[]));
  }, [userId]);

  const fetchFollowUps = useCallback(() => {
    if (!userId) return;
    supabase
      .from("client_follow_ups")
      .select(`*, clients!client_follow_ups_client_id_fkey(
        name, product, current_stage, interest_scale
      )`)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("next_reminder", { ascending: true })
      .then(({ data }) => {
        setFollowUps((data ?? []) as FollowUpWithClient[]);
      });
  }, [userId]);

  useEffect(() => {
    fetchNotifs();
    fetchFollowUps();
  }, [fetchNotifs, fetchFollowUps]);

  // Realtime: new notifications pushed to this user
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifs:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as AppNotification;
          if (n.user_id !== userId) return;
          setNotifs(prev => [n, ...prev]);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
          if (Notification.permission === "granted") {
            new Notification(n.title, { body: n.body, icon: "/favicon.ico" });
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Re-fetch in case notifications arrived during subscribe handshake
          supabase
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(40)
            .then(({ data }) => setNotifs((data ?? []) as AppNotification[]));
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Counts ─────────────────────────────────────────────────────────────

  const unreadNotifs = notifs.filter(n => !n.read);
  const overdueFollowUps = followUps.filter(f => new Date(f.next_reminder) < new Date());
  const totalBadge = unreadNotifs.length + overdueFollowUps.length;

  // ── Notification actions ───────────────────────────────────────────────

  const handleReadNotif = async (n: AppNotification) => {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    if (n.client_id) {
      setIsOpen(false);
      navigate({ to: "/clients/$id", params: { id: n.client_id } });
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    toast.success("All marked as read");
  };

  // ── Access request inline response ────────────────────────────────────

  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const respondToAccessRequest = async (n: AppNotification, approved: boolean) => {
    const requestId = (n.payload as any)?.requestId as string | undefined;
    const requesterName = (n.payload as any)?.requesterName as string | undefined;
    if (!requestId || !n.client_id) {
      // Fallback: navigate to client page where AccessRequestManager handles it
      handleReadNotif(n);
      return;
    }
    setRespondingTo(n.id);
    try {
      // Find requester_id from the request row
      const { data: req } = await supabase
        .from("client_access_requests")
        .select("requester_id")
        .eq("id", requestId)
        .single();

      await supabase
        .from("client_access_requests")
        .update({ status: approved ? "approved" : "rejected" })
        .eq("id", requestId);

      const ownerName: string = me?.profile?.name ?? me?.profile?.full_name ?? "The client owner";
      const clientName = (n.payload as any)?.clientName as string ?? "the client";

      if (req?.requester_id) {
        const { notifyAccessResponse } = await import("@/lib/notify");
        await notifyAccessResponse(req.requester_id, n.client_id, clientName, approved, ownerName);
      }

      // Mark notification read and update locally
      await markNotificationRead(n.id);
      setNotifs(prev => prev.map(x =>
        x.id === n.id
          ? { ...x, read: true, type: approved ? "access_approved" : "access_rejected" as any }
          : x
      ));
      toast.success(approved ? `Access granted to ${requesterName ?? "user"}` : `Request declined`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to respond");
    } finally {
      setRespondingTo(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-bold">
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[26rem] p-0" align="end">
        <Tabs defaultValue="activity">
          <div className="flex items-center justify-between px-3 pt-3 pb-0">
            <TabsList className="h-8">
              <TabsTrigger value="activity" className="text-xs gap-1.5">
                Activity
                {unreadNotifs.length > 0 && (
                  <span className="h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-bold">
                    {unreadNotifs.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="followups" className="text-xs gap-1.5">
                Follow-ups
                {overdueFollowUps.length > 0 && (
                  <span className="h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold">
                    {overdueFollowUps.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            {unreadNotifs.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={handleMarkAllRead}>
                <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
              </Button>
            )}
          </div>

          {/* ── Activity tab ── */}
          <TabsContent value="activity" className="mt-0">
            {notifs.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No activity yet</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y">
                {notifs.map(n => (
                  <div key={n.id} className={`w-full text-left p-3 flex flex-col gap-2 transition-colors hover:bg-accent/50 ${n.read ? "opacity-60" : "bg-accent/20"}`}>
                    {/* Top row: icon + body + arrow */}
                    <button
                      onClick={() => handleReadNotif(n)}
                      className="flex items-start gap-2.5 w-full text-left"
                    >
                      <NotifIcon type={n.type} />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className={`text-xs leading-snug ${n.read ? "" : "font-medium"}`}>{n.body}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString(undefined, {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
                      {n.client_id && n.type !== "access_request" && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                    </button>

                    {/* Inline Accept / Decline for pending access requests */}
                    {n.type === "access_request" && !n.read && (
                      <div className="flex gap-2 pl-6">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 flex-1 bg-green-600 hover:bg-green-700 text-white"
                          disabled={respondingTo === n.id}
                          onClick={(e) => { e.stopPropagation(); respondToAccessRequest(n, true); }}
                        >
                          <ShieldCheck className="h-3 w-3" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={respondingTo === n.id}
                          onClick={(e) => { e.stopPropagation(); respondToAccessRequest(n, false); }}
                        >
                          <ShieldOff className="h-3 w-3" /> Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Follow-ups tab ── */}
          <TabsContent value="followups" className="mt-0">
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">No pending follow-ups</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y">
                {followUps.map(f => {
                  const client = f.clients;
                  const isOverdue = new Date(f.next_reminder) < new Date();
                  const interest = client?.interest_scale != null ? Number(client.interest_scale) : null;
                  const interestLabel =
                    interest == null ? null :
                    interest >= 9 ? "High-Priority" :
                    interest >= 7 ? "Committed" :
                    interest >= 5 ? "Engaged" :
                    interest >= 3 ? "Exploring" : "Unqualified";
                  const interestColor =
                    interest == null ? "" :
                    interest >= 7 ? "text-green-500" :
                    interest >= 5 ? "text-yellow-500" : "text-red-400";

                  return (
                    <div key={f.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-sm font-semibold truncate">{client?.name ?? "Unknown"}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {client?.product && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0">{client.product}</Badge>
                            )}
                            {client?.current_stage != null && (
                              <span className="text-xs text-muted-foreground">Stage {client.current_stage}</span>
                            )}
                            {interestLabel && (
                              <span className={`text-xs font-medium ${interestColor}`}>
                                {interest?.toFixed(1)} · {interestLabel}
                              </span>
                            )}
                          </div>
                          {client?.created_by_name && (
                            <p className="text-xs text-muted-foreground/70">
                              Added by <span className="text-primary font-medium">{client.created_by_name}</span>
                              {client.created_by_dept ? ` · ${client.created_by_dept}` : ""}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            <span className="capitalize">{f.frequency.replace(/_/g, " ")}</span>
                            {" · "}
                            <span className={isOverdue ? "text-red-400 font-medium" : ""}>
                              {isOverdue
                                ? `Overdue since ${new Date(f.next_reminder).toLocaleDateString()}`
                                : `Due ${new Date(f.next_reminder).toLocaleDateString()}`}
                            </span>
                          </p>
                          {f.note && <p className="text-xs text-muted-foreground italic">"{f.note}"</p>}
                        </div>
                        <Button
                          variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0"
                          onClick={() => { setIsOpen(false); navigate({ to: "/clients/$id", params: { id: f.client_id } }); }}
                        >
                          View <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
