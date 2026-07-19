import { useState, useEffect } from "react";
import { Bell, ArrowRight, CheckCheck, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cancelFollowUp, completeFollowUp, logFollowUp, FollowUp } from "@/lib/follow-ups";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

interface FollowUpWithClient extends FollowUp {
  clients: {
    name: string;
    product: string | null;
    current_stage: number;
    interest_scale: number | null;
  } | null;
}

function FollowUpNotifications() {
  const { u } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUpWithClient[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  const fetchFollowUps = () => {
    if (!u?.user?.id) return;
    supabase
      .from("client_follow_ups")
      .select("*, clients!client_follow_ups_client_id_fkey(name, product, current_stage, interest_scale)")
      .eq("user_id", u.user.id)
      .eq("status", "active")
      .order("next_reminder", { ascending: true })
      .then(({ data }) => setFollowUps((data as unknown as FollowUpWithClient[]) ?? []));
  };

  useEffect(() => { fetchFollowUps(); }, [u?.user?.id]);

  const withLoading = async (id: string, fn: () => Promise<void>) => {
    setLoading(prev => ({ ...prev, [id]: true }));
    try { await fn(); } finally { setLoading(prev => ({ ...prev, [id]: false })); }
  };

  // "Followed up" — log the contact, reschedule, keep active
  const handleFollowedUp = async (followUp: FollowUpWithClient) => {
    await withLoading(followUp.id, async () => {
      const updated = await logFollowUp(followUp);
      setFollowUps(prev => prev.map(f =>
        f.id === followUp.id ? { ...f, next_reminder: updated.next_reminder } : f
      ));
      const nextDate = new Date(updated.next_reminder).toLocaleDateString();
      toast.success(`Logged — next reminder ${nextDate}`);
    });
  };

  // "Done" — follow-up is fully resolved, no more reminders
  const handleDone = async (id: string, clientName: string) => {
    await withLoading(id, async () => {
      await completeFollowUp(id);
      setFollowUps(prev => prev.filter(f => f.id !== id));
      toast.success(`Follow-up with ${clientName} marked complete`);
    });
  };

  // "Stop" — stop the recurring reminder entirely
  const handleStop = async (id: string) => {
    await withLoading(id, async () => {
      await cancelFollowUp(id);
      setFollowUps(prev => prev.filter(f => f.id !== id));
      toast.success("Follow-up stopped");
    });
  };

  const overdue = followUps.filter(f => new Date(f.next_reminder) < new Date());
  const badgeCount = followUps.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">
              {badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Pending Follow-ups</h3>
          {overdue.length > 0 && (
            <Badge variant="destructive" className="text-xs">{overdue.length} overdue</Badge>
          )}
        </div>

        {followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No pending follow-ups</p>
        ) : (
          <div className="max-h-[440px] overflow-y-auto divide-y">
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
              const busy = loading[f.id];

              return (
                <div key={f.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    {/* Left: client info */}
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {client?.name ?? "Unknown client"}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {client?.product && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {client.product}
                          </Badge>
                        )}
                        {client?.current_stage != null && (
                          <span className="text-xs text-muted-foreground">
                            Stage {client.current_stage}
                          </span>
                        )}
                        {interestLabel && (
                          <span className={`text-xs font-medium ${interestColor}`}>
                            {interest?.toFixed(1)} · {interestLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="capitalize">{f.frequency.replace(/_/g, " ")}</span>
                        {" · "}
                        <span className={isOverdue ? "text-red-400 font-medium" : ""}>
                          {isOverdue
                            ? `Overdue since ${new Date(f.next_reminder).toLocaleDateString()}`
                            : `Due ${new Date(f.next_reminder).toLocaleDateString()}`}
                        </span>
                      </p>
                      {f.note && (
                        <p className="text-xs text-muted-foreground italic">"{f.note}"</p>
                      )}
                    </div>

                    {/* Right: view link */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => { setIsOpen(false); navigate({ to: "/clients/$id", params: { id: f.client_id } }); }}
                    >
                      View <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>

                  {/* Action row */}
                  <div className="flex gap-1.5">
                    {/* PRIMARY: log a follow-up contact and reschedule */}
                    <Button
                      size="sm"
                      className="h-7 flex-1 text-xs gap-1"
                      disabled={busy}
                      onClick={() => handleFollowedUp(f)}
                    >
                      <Check className="h-3 w-3" />
                      Followed up today
                    </Button>

                    {/* Close follow-up = fully done, no more reminders */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-stage-3 border-stage-3/30 hover:bg-stage-3/10"
                      disabled={busy}
                      onClick={() => handleDone(f.id, client?.name ?? "client")}
                    >
                      <CheckCheck className="h-3 w-3" />
                      Close follow-up
                    </Button>

                    {/* Stop = cancel recurring reminder */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => handleStop(f.id)}
                    >
                      <X className="h-3 w-3" />
                      Stop
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="px-3 py-2 border-t bg-muted/30">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Followed up today</span> — log contact &amp; reschedule ·{" "}
            <span className="font-medium text-foreground">Close follow-up</span> — no more reminders ·{" "}
            <span className="font-medium text-foreground">Stop</span> — remove reminder
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { FollowUpNotifications };
