import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logFollowUp, completeFollowUp, cancelFollowUp, FollowUp, isLoggedThisCycle, followUpStatusText } from "@/lib/follow-ups";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  component: FollowUpsPage,
});

const ACTIVITY_TYPES = [
  { value: "call",           label: "📞 Phone Call" },
  { value: "whatsapp",       label: "💬 WhatsApp Message" },
  { value: "sms",            label: "📱 SMS" },
  { value: "email",          label: "✉️ Email" },
  { value: "linkedin_dm",    label: "💼 LinkedIn Message" },
  { value: "ig_dm",          label: "📸 Instagram DM" },
  { value: "facebook_dm",    label: "👥 Facebook DM" },
  { value: "twitter_dm",     label: "🐦 X / Twitter DM" },
  { value: "telegram",       label: "✈️ Telegram" },
  { value: "meeting",        label: "🤝 Physical Meeting" },
  { value: "video_call",     label: "🎥 Video Call" },
  { value: "conference",     label: "🎪 Conference / Event" },
  { value: "demo",           label: "🖥️ Demo / Walkthrough" },
  { value: "website_form",   label: "🌐 Website Form" },
  { value: "referral_intro", label: "🔗 Referral Introduction" },
];

interface FollowUpWithClient extends FollowUp {
  last_logged_at: string | null;
  clients: {
    name: string;
    category: string;
    mode_of_connection: string;
    product: string | null;
    current_stage: number;
    interest_scale: number | null;
    status: string;
  } | null;
}

function FollowUpsPage() {
  const { u } = useAuth();
  const userId = u?.user?.id;
  const [followUps, setFollowUps] = useState<FollowUpWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("client_follow_ups")
        .select(`
          *,
          clients!client_follow_ups_client_id_fkey(
            name, category, mode_of_connection, product,
            current_stage, interest_scale, status
          ),
          follow_up_logs(logged_at)
        `)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("next_reminder", { ascending: true });

      if (error) {
        console.error("follow-ups fetch error:", error);
        toast.error("Failed to load follow-ups");
        return;
      }

      // Attach last_logged_at from the most recent log entry
      const withLastLog = ((data ?? []) as any[]).map(f => {
        const logs: { logged_at: string }[] = f.follow_up_logs ?? [];
        const lastLog = logs.sort((a, b) =>
          new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        )[0] ?? null;
        return {
          ...f,
          last_logged_at: lastLog?.logged_at ?? null,
          follow_up_logs: undefined,
        };
      });

      setFollowUps(withLastLog as FollowUpWithClient[]);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch whenever the user id becomes available OR the page mounts
  useEffect(() => {
    void load();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    try { await fn(); } finally { setBusy(prev => ({ ...prev, [id]: false })); }
  };

  const handleFollowedUp = async (f: FollowUpWithClient, activityType: string) => {
    await withBusy(f.id, async () => {
      const now = new Date().toISOString();
      const updated = await logFollowUp(f, activityType);
      setFollowUps(prev =>
        prev.map(x => x.id === f.id
          ? { ...x, next_reminder: updated.next_reminder, last_logged_at: now }
          : x
        )
      );
      toast.success(`Logged — next reminder ${new Date(updated.next_reminder).toLocaleDateString()}`);
    });
  };

  const handleDone = async (f: FollowUpWithClient) => {
    await withBusy(f.id, async () => {
      await completeFollowUp(f.id);
      setFollowUps(prev => prev.filter(x => x.id !== f.id));
      toast.success(`Follow-up with ${f.clients?.name ?? "client"} marked complete`);
    });
  };

  const handleStop = async (f: FollowUpWithClient) => {
    await withBusy(f.id, async () => {
      await cancelFollowUp(f.id);
      setFollowUps(prev => prev.filter(x => x.id !== f.id));
      toast.success("Follow-up stopped");
    });
  };

  const overdue = followUps.filter(f => new Date(f.next_reminder) < new Date());
  const upcoming = followUps.filter(f => new Date(f.next_reminder) >= new Date());

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Follow-ups
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${followUps.length} active${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}`}
          </p>
        </div>
        {overdue.length > 0 && (
          <Badge variant="destructive">{overdue.length} overdue</Badge>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : followUps.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No active follow-ups. When you add a follow-up to a client it'll show here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overdue group */}
          {overdue.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-red-400">Overdue</p>
              <div className="space-y-2">
                {overdue.map(f => (
                  <FollowUpCard
                    key={f.id}
                    f={f}
                    busy={!!busy[f.id]}
                    overdue
                    onFollowedUp={handleFollowedUp}
                    onDone={handleDone}
                    onStop={handleStop}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming group */}
          {upcoming.length > 0 && (
            <section className="space-y-2">
              {overdue.length > 0 && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Upcoming</p>
              )}
              <div className="space-y-2">
                {upcoming.map(f => (
                  <FollowUpCard
                    key={f.id}
                    f={f}
                    busy={!!busy[f.id]}
                    overdue={false}
                    onFollowedUp={handleFollowedUp}
                    onDone={handleDone}
                    onStop={handleStop}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function FollowUpCard({
  f,
  busy,
  overdue,
  onFollowedUp,
  onDone,
  onStop,
}: {
  f: FollowUpWithClient;
  busy: boolean;
  overdue: boolean;
  onFollowedUp: (f: FollowUpWithClient, activityType: string) => void;
  onDone: (f: FollowUpWithClient) => void;
  onStop: (f: FollowUpWithClient) => void;
}) {
  const [activityType, setActivityType] = useState("");
  const logged = isLoggedThisCycle(f.next_reminder, f.frequency, f.custom_interval_days, f.last_logged_at);
  const { text: statusText, loggedText, overdue: isOverdueStatus } = followUpStatusText(f.next_reminder, f.last_logged_at, logged);
  const client = f.clients;
  const interest = client?.interest_scale != null ? Number(client.interest_scale) : null;
  const interestLabel =
    interest == null ? null :
    interest >= 9 ? "High-Priority" :
    interest >= 7 ? "Committed" :
    interest >= 5 ? "Engaged" :
    interest >= 3 ? "Exploring" : "Unqualified";
  const interestColor =
    interest == null ? "text-muted-foreground" :
    interest >= 7 ? "text-green-500" :
    interest >= 5 ? "text-yellow-500" : "text-red-400";

  return (
    <Card className={overdue ? "border-red-500/30" : "hover:border-primary/40 transition-colors"}>
      <CardContent className="p-4 space-y-3">
        {/* Top row: client info + view link */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="font-semibold truncate">
              {client?.name ?? "Unknown client"}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {[client?.category, client?.mode_of_connection].filter(Boolean).join(" · ")}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {client?.product && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {client.product}
                </Badge>
              )}
              {client?.current_stage != null && (
                <Badge
                  variant="outline"
                  className={
                    client.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
                    client.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
                    "border-stage-3/30 text-stage-3 bg-stage-3/10"
                  }
                >
                  Stage {client.current_stage}
                </Badge>
              )}
              {interestLabel && (
                <span className={`text-xs font-medium ${interestColor}`}>
                  {interest?.toFixed(1)} · {interestLabel}
                </span>
              )}
            </div>
          </div>

          <Link
            to="/clients/$id"
            params={{ id: f.client_id }}
            className="shrink-0"
          >
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1">
              View <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>

        {/* Follow-up meta */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize">{f.frequency.replace(/_/g, " ")}</span>
          <span>·</span>
          <span className={isOverdueStatus ? "text-red-400 font-medium" : ""}>
            {statusText}
          </span>
          {f.note && (
            <>
              <span>·</span>
              <span className="italic truncate max-w-[200px]">"{f.note}"</span>
            </>
          )}
        </div>

        {/* Channel picker + log — only when not yet logged this session */}
        {!logged ? (
          <>
            <div className="flex flex-wrap gap-1">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={busy}
                  onClick={() => setActivityType(prev => prev === t.value ? "" : t.value)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    activityType === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5"
                disabled={busy || !activityType}
                onClick={() => {
                  if (!activityType) { toast.error("Pick how you followed up"); return; }
                  onFollowedUp(f, activityType);
                  setActivityType("");
                }}
              >
                <Check className="h-3.5 w-3.5" />
                {activityType
                  ? `Log via ${ACTIVITY_TYPES.find(t => t.value === activityType)?.label ?? activityType}`
                  : "Pick a channel above"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 text-stage-3 border-stage-3/30 hover:bg-stage-3/10"
                disabled={busy}
                onClick={() => onDone(f)}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Close follow-up
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => onStop(f)}
              >
                <X className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
              ✓ {loggedText ?? `Followed up · next reminder ${new Date(f.next_reminder).toLocaleDateString()}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 text-stage-3 border-stage-3/30 hover:bg-stage-3/10"
                disabled={busy}
                onClick={() => onDone(f)}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Close follow-up
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => onStop(f)}
              >
                <X className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
