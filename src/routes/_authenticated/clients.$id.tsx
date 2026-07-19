import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit, TrendingUp, XCircle, Trophy, Bell, Lock, ShieldAlert, Clock } from "lucide-react";
import { InterestScaleSlider } from "@/components/interest-scale-slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { classifyStageValue } from "@/lib/utils";
import { classifyStageValueAI } from "@/lib/api/ai.functions";
import { createFollowUp, getActiveFollowUps, cancelFollowUp, completeFollowUp, FollowUp, suggestFrequency, isLoggedThisCycle, followUpStatusText } from "@/lib/follow-ups";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { notifyStageProgress, notifyClientWon, notifyClientLost, notifyAccessRequest, notifyAccessResponse } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

const LOST_REASONS = ["Price", "Timing", "Competitor", "Unresponsive", "Out of scope", "Other"];

// Shared outreach method options used in StageUpdateDialog and FollowUpSection
const ACTIVITY_TYPES = [
  // ── Voice ─────────────────────────────────────────────────────────────
  { value: "call",           label: "📞 Phone Call" },
  // ── Messaging ─────────────────────────────────────────────────────────
  { value: "whatsapp",       label: "💬 WhatsApp Message" },
  { value: "sms",            label: "📱 SMS" },
  { value: "email",          label: "✉️ Email" },
  { value: "linkedin_dm",    label: "💼 LinkedIn Message" },
  { value: "ig_dm",          label: "📸 Instagram DM" },
  { value: "facebook_dm",    label: "👥 Facebook DM" },
  { value: "twitter_dm",     label: "🐦 X / Twitter DM" },
  { value: "telegram",       label: "✈️ Telegram" },
  // ── Face-to-face / video ───────────────────────────────────────────────
  { value: "meeting",        label: "🤝 Physical Meeting" },
  { value: "video_call",     label: "🎥 Video Call" },
  // ── Events & structured ───────────────────────────────────────────────
  { value: "conference",     label: "🎪 Conference / Event" },
  { value: "demo",           label: "🖥️ Demo / Walkthrough" },
  { value: "website_form",   label: "🌐 Website Form" },
  { value: "referral_intro", label: "🔗 Referral Introduction" },
];

function ClientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [followUpReloadTrigger, setFollowUpReloadTrigger] = useState(0);

  const { data: client, refetch } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const res = await query(
        `SELECT c.*, p.name AS created_by_name, p.department AS created_by_dept
         FROM clients c
         LEFT JOIN profiles p ON p.id = c.created_by
         WHERE c.id = $1`,
        [id]
      );
      if (res.error) throw res.error;
      return res.data && res.data.length > 0 ? res.data[0] : null;
    },
  });
  const { data: events } = useQuery({
    queryKey: ["events", id],
    queryFn: async () => {
      const res = await query(
        `SELECT e.*, p.name AS updated_by_name
         FROM client_stage_events e
         LEFT JOIN profiles p ON p.id = e.user_id
         WHERE e.client_id = $1
         ORDER BY e.created_at DESC`,
        [id]
      );
      if (res.error) throw res.error;
      return res.data;
    },
  });

  // Check access: owner, admin, or has an approved request
  const { data: accessRequest } = useQuery({
    queryKey: ["access-request", id, me?.user?.id],
    enabled: !!me && !!client && !me.isAdmin && client?.created_by !== me?.user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_access_requests")
        .select("*")
        .eq("client_id", id)
        .eq("requester_id", me!.user!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!client || !me) return <div className="text-muted-foreground">Loading…</div>;

  const isOwner = client.created_by === me.user?.id;
  const isAdmin = me.isAdmin;
  const hasAccess = isOwner || isAdmin || accessRequest?.status === "approved";

  // Non-owner without access → show locked view
  if (!hasAccess) {
    return (
      <LockedClientView
        client={client}
        me={me}
        existingRequest={accessRequest ?? null}
        onRequestSent={() => qc.invalidateQueries({ queryKey: ["access-request", id, me?.user?.id] })}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/clients"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={
              client.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
              client.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
              client.current_stage === 3 ? "border-stage-3/30 text-stage-3 bg-stage-3/10" : ""
            }>Stage {client.current_stage}{client.stage_label ? ` · ${client.stage_label}` : ""}</Badge>
            <Badge variant={client.status === "won" ? "default" : client.status === "lost" ? "destructive" : "secondary"}>{client.status}</Badge>
            <Badge variant="outline">{client.category}</Badge>
            {client.product && <Badge variant="outline">{client.product}</Badge>}
            <Badge variant="outline">{client.mode_of_connection}</Badge>
          </div>
        </div>
        {/* Edit and stage update only for owner and admin */}
        {(isOwner || isAdmin) && (
          <div className="flex gap-2">
            <EditClientDialog client={client} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
            {client.status === "active" && (
              <StageUpdateDialog client={client} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["events", id] }); qc.invalidateQueries({ queryKey: ["clients"] }); setFollowUpReloadTrigger(n => n + 1); }} />
            )}
          </div>
        )}
        {/* Owner: manage access requests */}
        {isOwner && (
          <AccessRequestManager clientId={id} />
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <Detail k="Email" v={client.email} />
          <Detail k="Location" v={client.location} />
          <Detail k="Contact Person" v={client.contact_person} />
          <Detail k="Contact Phone" v={client.contact_person_phone} />
          <Detail k="Contact Email" v={client.contact_person_email} />
          <Detail k="Contact Role" v={client.contact_person_role} />
          <Detail k="Stage Value" v={String(client.stage_value)} />
          <Detail k="Interest Scale" v={client.interest_scale != null ? Number(client.interest_scale).toFixed(1) : undefined} />
          {client.lost_reason && <Detail k="Lost Reason" v={client.lost_reason} />}
          <Detail k="Created" v={new Date(client.created_at).toLocaleDateString()} />
          <Detail k="Updated" v={new Date(client.updated_at).toLocaleDateString()} />
          {client.created_by_name && (
            <div>
              <div className="text-xs text-muted-foreground">Added by</div>
              <div className="font-medium text-primary">
                {client.created_by_name}{client.created_by_dept ? ` · ${client.created_by_dept}` : ""}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {client.custom_fields && Object.keys(client.custom_fields as Record<string, string>).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Custom Fields</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
            {Object.entries(client.custom_fields as Record<string, string>).map(([k, v]) => (
              <Detail key={k} k={k} v={String(v)} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline</CardTitle><CardDescription>All stage updates and notes</CardDescription></CardHeader>
        <CardContent>
          {events && events.length > 0 ? (
            <ul className="space-y-3">
              {events.map((e: any) => {
                const stageNum = e.to_stage ?? e.from_stage;
                const borderCls = stageNum === 1 ? "border-stage-1/50" :
                                  stageNum === 2 ? "border-stage-2/50" :
                                  stageNum === 3 ? "border-stage-3/50" :
                                  "border-primary/50";
                return (
                  <li key={e.id} className={`border-l-2 ${borderCls} pl-3 pb-2`}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <Badge variant="outline" className="text-xs">{e.event_type}</Badge>
                    {e.from_stage == null && e.to_stage != null && (
                      <span>Started at Stage {e.to_stage}</span>
                    )}
                    {e.from_stage != null && e.to_stage != null && (
                      <span>Stage {e.from_stage} → {e.to_stage}</span>
                    )}
                    {e.from_stage != null && e.to_stage == null && (
                      <span>Stage {e.from_stage}</span>
                    )}
                    {e.updated_by_name && (
                      <span className="text-muted-foreground/70">by <span className="text-muted-foreground font-medium">{e.updated_by_name}</span></span>
                    )}
                    <span>· {new Date(e.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm mt-1">{e.description}</p>
                  {e.lost_reason && <p className="text-xs text-primary mt-1">Reason: {e.lost_reason}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No events yet</p>
          )}
        </CardContent>
      </Card>

      <FollowUpSection clientId={client.id} clientStatus={client.status} reloadTrigger={followUpReloadTrigger} />
    </div>
  );
}

function LockedClientView({
  client,
  me,
  existingRequest,
  onRequestSent,
}: {
  client: any;
  me: any;
  existingRequest: any | null;
  onRequestSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function sendRequest() {
    setSending(true);
    try {
      // Upsert request row and get back the row ID
      const { data: upserted, error } = await supabase.from("client_access_requests").upsert({
        client_id: client.id,
        requester_id: me.user.id,
        owner_id: client.created_by,
        message: message.trim() || null,
        status: "pending",
      }, { onConflict: "client_id,requester_id" }).select("id").single();
      if (error) throw error;

      // Notify the owner — pass the actual access request row ID so the
      // notification center can respond inline without a page navigation
      await notifyAccessRequest(
        client.id,
        client.name,
        client.created_by,
        me.profile?.name ?? "A team member",
        upserted.id,          // ← real request row ID (was incorrectly client.id)
        message.trim() || null
      );
      toast.success("Request sent — the client owner will be notified");
      setOpen(false);
      onRequestSent();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send request");
    } finally {
      setSending(false);
    }
  }

  const isPending = existingRequest?.status === "pending";
  const isRejected = existingRequest?.status === "rejected";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/clients"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>

      {/* Public info — name, stage, status, category only */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="outline" className={
            client.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
            client.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
            "border-stage-3/30 text-stage-3 bg-stage-3/10"
          }>Stage {client.current_stage}</Badge>
          <Badge variant={client.status === "won" ? "default" : client.status === "lost" ? "destructive" : "secondary"}>{client.status}</Badge>
          <Badge variant="outline">{client.category}</Badge>
          {client.product && <Badge variant="outline">{client.product}</Badge>}
        </div>
        {client.created_by_name && (
          <p className="text-sm text-muted-foreground mt-1">
            Added by <span className="text-primary font-medium">{client.created_by_name}</span>
            {client.created_by_dept ? ` · ${client.created_by_dept}` : ""}
          </p>
        )}
      </div>

      {/* Locked card */}
      <Card className="border-border/60">
        <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">Contact details are private</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              This client belongs to <span className="text-primary font-medium">{client.created_by_name ?? "another rep"}</span>.
              Request access to view contact info, edit details, or push progress.
            </p>
          </div>

          {isPending && (
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <Clock className="h-4 w-4" />
              Request pending — waiting for {client.created_by_name ?? "the owner"} to respond
            </div>
          )}

          {isRejected && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4" />
              Access was declined
            </div>
          )}

          {!isPending && !isRejected && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Request Access</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request access to {client.name}</DialogTitle>
                  <DialogDescription>
                    {client.created_by_name ?? "The client owner"} will be notified and can approve or decline.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Message (optional)</Label>
                  <Textarea
                    rows={3}
                    placeholder="Explain why you need access, e.g. following up on a referral…"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={sendRequest} disabled={sending}>
                    {sending ? "Sending…" : "Send Request"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {isRejected && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Send Another Request</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request access to {client.name}</DialogTitle>
                  <DialogDescription>Your previous request was declined. You can send a new one with a message.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea rows={3} placeholder="Explain why you need access…" value={message} onChange={e => setMessage(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button onClick={sendRequest} disabled={sending}>{sending ? "Sending…" : "Send Request"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AccessRequestManager({ clientId }: { clientId: string }) {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();

  const { data: requests } = useQuery({
    queryKey: ["access-requests-for-client", clientId],
    queryFn: async () => {
      // Use a raw SQL join because the Supabase FK on requester_id points to
      // auth.users, not profiles — the auto-join syntax doesn't traverse that.
      const res = await query(
        `SELECT r.*, p.name AS requester_name, p.department AS requester_department
         FROM client_access_requests r
         LEFT JOIN profiles p ON p.id = r.requester_id
         WHERE r.client_id = $1 AND r.status = 'pending'
         ORDER BY r.created_at DESC`,
        [clientId]
      );
      return (res.data ?? []) as any[];
    },
  });

  if (!requests || requests.length === 0) return null;

  async function respond(requestId: string, requesterId: string, approved: boolean) {
    try {
      const { error } = await supabase
        .from("client_access_requests")
        .update({ status: approved ? "approved" : "rejected" })
        .eq("id", requestId);
      if (error) throw error;

      const ownerName: string = me?.profile?.name ?? me?.profile?.full_name ?? "The client owner";

      // Get client name for the notification
      const { data: clientRow } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .single();
      const clientName = (clientRow as any)?.name ?? "the client";

      await notifyAccessResponse(requesterId, clientId, clientName, approved, ownerName);

      toast.success(approved ? "Access granted" : "Request declined");
      qc.invalidateQueries({ queryKey: ["access-requests-for-client", clientId] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to respond");
    }
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          {requests.length} pending access request{requests.length > 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between gap-3 p-2 rounded-md border border-border">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {r.requester_name ?? "Unknown user"}
                {r.requester_department ? ` · ${r.requester_department}` : ""}
              </p>
              {r.message && <p className="text-xs text-muted-foreground italic">"{r.message}"</p>}
              <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => respond(r.id, r.requester_id, true)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => respond(r.id, r.requester_id, false)}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Detail({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v ?? "—"}</div>
    </div>
  );
}

function EditClientDialog({ client, onSaved }: { client: { id: string; name: string; email: string | null; location: string | null; contact_person: string | null; contact_person_phone: string | null; contact_person_email: string | null; contact_person_role: string | null; product: string | null; interest_scale: number | null }; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => (await supabase.from("admin_products").select("*").order("name")).data ?? [],
  });
  const [form, setForm] = useState({
    name: client.name,
    email: client.email ?? "",
    location: client.location ?? "",
    contact_person: client.contact_person ?? "",
    contact_person_phone: client.contact_person_phone ?? "",
    contact_person_email: client.contact_person_email ?? "",
    contact_person_role: client.contact_person_role ?? "",
    product: client.product ?? "",
  });
  const [interestScale, setInterestScale] = useState(Number(client.interest_scale ?? 5));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("clients").update({
      name: form.name,
      email: form.email || null,
      location: form.location || null,
      contact_person: form.contact_person || null,
      contact_person_phone: form.contact_person_phone || null,
      contact_person_email: form.contact_person_email || null,
      contact_person_role: form.contact_person_role || null,
      product: form.product || null,
      interest_scale: interestScale,
    }).eq("id", client.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1" />Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Client Details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="space-y-1"><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div className="space-y-1"><Label>Contact Phone</Label><Input value={form.contact_person_phone} onChange={(e) => setForm({ ...form, contact_person_phone: e.target.value })} /></div>
          <div className="space-y-1"><Label>Contact Email</Label><Input value={form.contact_person_email} onChange={(e) => setForm({ ...form, contact_person_email: e.target.value })} /></div>
          <div className="space-y-1"><Label>Contact Role</Label><Input value={form.contact_person_role} onChange={(e) => setForm({ ...form, contact_person_role: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>Product</Label>
            <Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v === "__clear__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {form.product && <SelectItem value="__clear__" className="text-muted-foreground italic">Clear selection</SelectItem>}
                {products?.map((p: { id: string; name: string }) => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="mt-1"
              placeholder="Or type custom product"
              value={products?.some((p: { id: string; name: string }) => p.name === form.product) ? "" : form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
            />
          </div>
          <div className="pt-1">
            <InterestScaleSlider value={interestScale} onChange={setInterestScale} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageUpdateDialog({ client, onSaved }: { client: { id: string; current_stage: number; interest_scale: number | null }; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"progress" | "won" | "lost">("progress");
  const [toStage, setToStage] = useState(client.current_stage);
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("");
  const [lostReason, setLostReason] = useState("Unresponsive");
  const [customReason, setCustomReason] = useState("");
  const [interestScale, setInterestScale] = useState(Number(client.interest_scale ?? 5));
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [pendingEventType, setPendingEventType] = useState<"progress" | "regress" | "note" | "won" | "lost">("progress");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpFrequency, setFollowUpFrequency] = useState(() =>
    suggestFrequency(Number(client.interest_scale ?? 5), client.current_stage)
  );
  const [followUpNote, setFollowUpNote] = useState("");

  const classifyWithTimeout = async (eventType: "progress" | "regress" | "note" | "won" | "lost") => {
    setAiLoading(true);
    try {
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("AI timeout")), 120000);
      });
      const aiPromise = classifyStageValueAI({
        data: {
          description,
          fromStage: client.current_stage,
          toStage: toStage,
          eventType: eventType,
          interestScale,
        },
      });
      const result = await Promise.race([aiPromise, timeoutPromise]);
      clearTimeout(timeoutId!);
      setAiLoading(false);
      return result.stageValue;
    } catch {
      setAiLoading(false);
      setShowFallback(true);
      return null;
    }
  };

  const retryClassification = async () => {
    const eventType: "progress" | "regress" | "note" | "won" | "lost" =
      mode === "won" ? "won"
      : mode === "lost" ? "lost"
      : toStage === client.current_stage ? "note"
      : toStage > client.current_stage ? "progress"
      : "regress";
    const result = await classifyWithTimeout(eventType);
    if (result !== null) {
      setShowFallback(false);
      await doSave(result, eventType);
    }
  };

  const doSave = async (stageVal: number, eventType: "progress" | "regress" | "note" | "won" | "lost") => {
    if (!description.trim()) return toast.error("Describe what happened");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return toast.error("Not signed in"); }

    const reason = lostReason === "Other" ? customReason.trim() : lostReason;

    // Update clients table — only update fields relevant to the mode
    // (never overwrite status/current_stage/etc with NULL when not changing them)
    let clientRes;
    if (mode === "won") {
      clientRes = await query(
        `UPDATE clients SET status = 'won', current_stage = 3, stage_value = 1 WHERE id = $1`,
        [client.id]
      );
    } else if (mode === "lost") {
      clientRes = await query(
        `UPDATE clients SET status = 'lost', lost_reason = $1 WHERE id = $2`,
        [reason, client.id]
      );
    } else {
      clientRes = await query(
        `UPDATE clients SET current_stage = $1, stage_value = $2, stage_notes = $3 WHERE id = $4`,
        [toStage, stageVal, description, client.id]
      );
    }
    if (clientRes.error) {
      setSaving(false);
      return toast.error(clientRes.error.message);
    }

    // Insert into client_stage_events — also record interest_scale so we have
    // a time-series of interest across the deal lifecycle (entry vs exit, trend)
    const toStageVal = mode === "won" ? 3 : mode === "lost" ? null : toStage;
    const stageValInsert = mode === "won" ? 1 : mode === "lost" ? 0 : stageVal;
    const lostReasonInsert = mode === "lost" ? reason : null;
    const eventRes = await query(
      `INSERT INTO client_stage_events (client_id, user_id, from_stage, to_stage, event_type, description, lost_reason, stage_value, activity_type, interest_scale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [client.id, u.user.id, client.current_stage, toStageVal, eventType, description, lostReasonInsert, stageValInsert, activityType || null, interestScale]
    );
    if (eventRes.error) {
      setSaving(false);
      return toast.error(eventRes.error.message);
    }
    setSaving(false);
    toast.success(eventType === "note" ? "Update recorded" : "Stage updated");

    // If client was just marked won or lost — cancel all active follow-ups automatically
    if (mode === "won" || mode === "lost") {
      try {
        await supabase
          .from("client_follow_ups")
          .update({ status: "cancelled" })
          .eq("client_id", client.id)
          .eq("status", "active");
      } catch { /* non-critical */ }
    }

    // If an active follow-up exists for this client, auto-log it with the same activity type.
    // This means updating a stage after a contact also counts as the follow-up check-in —
    // the user doesn't need to log it separately in the follow-up section.
    if (activityType) {
      try {
        const { data: activeFollowUps } = await supabase
          .from("client_follow_ups")
          .select("*")
          .eq("client_id", client.id)
          .eq("user_id", u.user.id)
          .eq("status", "active");
        const { logFollowUp } = await import("@/lib/follow-ups");
        const { isLoggedThisCycle } = await import("@/lib/follow-ups");
        const { getFollowUpLogs } = await import("@/lib/follow-ups");
        if (activeFollowUps && activeFollowUps.length > 0) {
          const logs = await getFollowUpLogs(client.id);
          for (const fu of activeFollowUps) {
            // Find most recent log for this specific follow-up
            const lastLog = logs
              .filter((l: any) => l.follow_up_id === fu.id)
              .sort((a: any, b: any) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0] ?? null;
            const alreadyLogged = isLoggedThisCycle(fu.next_reminder, fu.frequency, fu.custom_interval_days, lastLog?.logged_at ?? null);
            if (!alreadyLogged) {
              await logFollowUp(fu, activityType);
            }
          }
        }
      } catch {
        // Non-critical — don't block the stage update toast
      }
    }

    if (followUpEnabled) {
      try {
        await createFollowUp(client.id, u.user.id, followUpFrequency, followUpNote || null);
        toast.success("Follow-up scheduled");
      } catch (err) {
        toast.error("Failed to schedule follow-up");
      }
    }

    // Fire admin notifications (fire-and-forget — don't block the UI)
    try {
      const { data: profileData } = await supabase.from("profiles").select("name").eq("id", u.user.id).single();
      const byName: string = (profileData as any)?.name ?? "Someone";
      const { data: clientData } = await supabase.from("clients").select("name, product").eq("id", client.id).single();
      const clientName: string = (clientData as any)?.name ?? "Unknown client";
      const product: string | null = (clientData as any)?.product ?? null;
      if (eventType === "won") {
        notifyClientWon(client.id, clientName, byName, product);
      } else if (eventType === "lost") {
        const reason = lostReason === "Other" ? customReason.trim() : lostReason;
        notifyClientLost(client.id, clientName, reason, byName);
      } else if (eventType === "progress" && toStage > client.current_stage) {
        notifyStageProgress(client.id, clientName, client.current_stage, toStage, byName);
      }
    } catch { /* non-critical */ }

    setOpen(false);
    setDescription("");
    setActivityType("");
    setShowFallback(false);
    setFollowUpEnabled(false);
    setFollowUpNote("");
    onSaved();
  };

  async function save() {
    if (!description.trim()) return toast.error("Describe what happened");
    if (!activityType) return toast.error("Pick how you reached out");

    const eventType: "progress" | "regress" | "note" | "won" | "lost" =
      mode === "won" ? "won"
      : mode === "lost" ? "lost"
      : toStage === client.current_stage ? "note"
      : toStage > client.current_stage ? "progress"
      : "regress";
    setPendingEventType(eventType);

    // For won/lost, use fixed stage values directly
    if (mode === "won" || mode === "lost") {
      const stageVal = mode === "won" ? 1 : 0;
      await doSave(stageVal, eventType);
      return;
    }

    // For progress/regress, try AI classification with timeout
    const stageVal = classifyStageValue(toStage, description);
    const result = await classifyWithTimeout(eventType);
    if (result !== null) {
      await doSave(result, eventType);
    } else {
      // Fallback will be shown, save will be triggered after user picks
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><TrendingUp className="h-4 w-4 mr-1" />Update Stage</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Stage</DialogTitle>
          <DialogDescription>Describe what happened. Mark Won when onboarded, Lost when negotiations break down</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Button variant={mode === "progress" ? "default" : "outline"} onClick={() => setMode("progress")}><TrendingUp className="h-4 w-4 mr-1" />Move</Button>
            <Button variant={mode === "won" ? "default" : "outline"} onClick={() => setMode("won")}><Trophy className="h-4 w-4 mr-1" />Won</Button>
            <Button variant={mode === "lost" ? "destructive" : "outline"} onClick={() => setMode("lost")}><XCircle className="h-4 w-4 mr-1" />Lost</Button>
          </div>

          {mode === "progress" && (
            <div className="space-y-1">
              <Label>New stage</Label>
              <Select value={String(toStage)} onValueChange={(v) => setToStage(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((s) => <SelectItem key={s} value={String(s)}>Stage {s}</SelectItem>)}
                </SelectContent>
              </Select>
              {toStage === client.current_stage && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                  <span className="text-amber-400">ℹ</span>
                  Client will remain in <span className="font-medium text-foreground">Stage {client.current_stage}</span> — this will be recorded as a touchpoint note.
                </p>
              )}
            </div>
          )}

          {mode === "lost" && (
            <div className="space-y-1">
              <Label>Lost reason</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              {lostReason === "Other" && (
                <Input className="mt-2" placeholder="Specify reason" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>How did you reach out? <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setActivityType(activityType === t.value ? "" : t.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    activityType === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>What happened</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the update…" />
          </div>

          <div className="space-y-2">
            <InterestScaleSlider value={interestScale} onChange={setInterestScale} />
          </div>

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className={(mode === "won" || mode === "lost") ? "text-muted-foreground" : ""}>
                Set Follow-up?
                {(mode === "won" || mode === "lost") && (
                  <span className="ml-2 text-xs text-muted-foreground">(not needed on close)</span>
                )}
              </Label>
              <Switch
                checked={followUpEnabled && mode !== "won" && mode !== "lost"}
                onCheckedChange={setFollowUpEnabled}
                disabled={mode === "won" || mode === "lost"}
              />
            </div>
            {followUpEnabled && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Frequency</Label>
                  <Select value={followUpFrequency} onValueChange={setFollowUpFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="every_2_days">Every 2 Days</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input placeholder="What to follow up about..." value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter><Button onClick={save} disabled={saving || aiLoading || !activityType}>{aiLoading ? "Classifying…" : saving ? "Saving…" : activityType ? "Push update" : "Pick a method above"}</Button></DialogFooter>
      </DialogContent>
      <Dialog open={showFallback} onOpenChange={(open) => { if (!open) setShowFallback(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>AI Classification Unavailable</DialogTitle>
            <DialogDescription>Is this client progressing well?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1"
              onClick={() => { setShowFallback(false); doSave(1, pendingEventType); }}>
              On Track
            </Button>
            <Button variant="destructive" className="flex-1"
              onClick={() => { setShowFallback(false); doSave(0, pendingEventType); }}>
              At Risk
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowFallback(false); retryClassification(); }}>
              Retry AI
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowFallback(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function FollowUpSection({ clientId, clientStatus, reloadTrigger }: { clientId: string; clientStatus: string; reloadTrigger?: number }) {
  const { u } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [logs, setLogs] = useState<import("@/lib/follow-ups").FollowUpLog[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  // Per follow-up activity type selection before logging
  const [pendingActivity, setPendingActivity] = useState<Record<string, string>>({});
  // last_logged_at per follow-up id — derived from follow_up_logs, updated optimistically on log
  const [lastLoggedAt, setLastLoggedAt] = useState<Record<string, string | null>>({});

  // Subscribe UI state
  const [subFrequency, setSubFrequency] = useState("daily");
  const [subCustomDays, setSubCustomDays] = useState("2");
  const [subNote, setSubNote] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  const reload = () => {
    if (!u?.user) return;
    getActiveFollowUps(u.user.id)
      .then(ups => {
        const filtered = ups.filter(f => f.client_id === clientId);
        setFollowUps(filtered);
        // Fetch most recent log per follow-up to determine cycle state
        return import("@/lib/follow-ups").then(m =>
          m.getFollowUpLogs(clientId).then(logs => {
            const latestByFollowUp: Record<string, string | null> = {};
            for (const f of filtered) latestByFollowUp[f.id] = null;
            for (const log of logs) {
              // log.follow_up_id links to the follow-up
              const fid = (log as any).follow_up_id;
              if (!fid || !(fid in latestByFollowUp)) continue;
              const existing = latestByFollowUp[fid];
              if (!existing || new Date(log.logged_at) > new Date(existing)) {
                latestByFollowUp[fid] = log.logged_at;
              }
            }
            setLastLoggedAt(latestByFollowUp);
            setLogs(logs);
          })
        );
      })
      .catch(console.error);
  };

  useEffect(() => { reload(); }, [u?.user?.id, clientId, reloadTrigger]);

  const withLoading = async (id: string, fn: () => Promise<void>) => {
    setLoading(prev => ({ ...prev, [id]: true }));
    try { await fn(); } finally { setLoading(prev => ({ ...prev, [id]: false })); }
  };

  const handleFollowedUp = async (followUp: FollowUp) => {
    if (!pendingActivity[followUp.id]) {
      toast.error("Pick how you followed up before logging");
      return;
    }
    await withLoading(followUp.id, async () => {
      const { logFollowUp } = await import("@/lib/follow-ups");
      const updated = await logFollowUp(followUp, pendingActivity[followUp.id]);
      const now = new Date().toISOString();
      setFollowUps(prev => prev.map(f => f.id === followUp.id ? { ...f, next_reminder: updated.next_reminder } : f));
      setLastLoggedAt(prev => ({ ...prev, [followUp.id]: now }));
      setPendingActivity(prev => { const n = { ...prev }; delete n[followUp.id]; return n; });
      // Refresh log list
      const { getFollowUpLogs } = await import("@/lib/follow-ups");
      setLogs(await getFollowUpLogs(clientId));
      toast.success(`Logged — next reminder ${new Date(updated.next_reminder).toLocaleDateString()}`);
    });
  };

  const handleDone = async (id: string) => {
    await withLoading(id, async () => {
      await completeFollowUp(id);
      setFollowUps(prev => prev.filter(f => f.id !== id));
      toast.success("Follow-up marked complete");
    });
  };

  const handleStop = async (id: string) => {
    await withLoading(id, async () => {
      await cancelFollowUp(id);
      setFollowUps(prev => prev.filter(f => f.id !== id));
      toast.success("Follow-up stopped");
    });
  };

  const handleSubscribe = async () => {
    if (!u?.user?.id) return;
    setSubscribing(true);
    try {
      const customDays = subFrequency === "custom" ? parseInt(subCustomDays) || 1 : undefined;
      const fu = await createFollowUp(clientId, u.user.id, subFrequency, subNote.trim() || null, customDays);
      setFollowUps([fu]);
      setSubNote("");
      toast.success("Follow-up reminder set");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to set follow-up");
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Follow-ups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Won/lost clients — deal is closed, no follow-up needed */}
        {(clientStatus === "won" || clientStatus === "lost") && followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {clientStatus === "won"
              ? "Deal closed — no follow-up needed."
              : "Deal lost — no follow-up needed."}
          </p>
        ) : (
        <>
        {/* No active follow-up — show subscribe UI (only for active clients) */}
        {followUps.length === 0 && clientStatus === "active" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No active reminder. Set one to stay on top of this client.</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "daily",        label: "Daily" },
                { value: "every_2_days", label: "Every 2 days" },
                { value: "weekly",       label: "Weekly" },
                { value: "custom",       label: "Custom" },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSubFrequency(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    subFrequency === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {subFrequency === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-24 text-xs"
                  value={subCustomDays}
                  onChange={e => setSubCustomDays(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            )}
            <Input
              className="h-8 text-xs"
              placeholder="Note (optional) — what to follow up about…"
              value={subNote}
              onChange={e => setSubNote(e.target.value)}
            />
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={subscribing}
              onClick={handleSubscribe}
            >
              <Bell className="h-3 w-3" />
              {subscribing ? "Setting up…" : "Subscribe to follow-up reminders"}
            </Button>
          </div>
        )}

        {/* Active follow-ups */}
        {followUps.length > 0 && (
          <div className="space-y-2">
            {followUps.map(f => {
              const busy = loading[f.id];
              const isLogged = isLoggedThisCycle(f.next_reminder, f.frequency, f.custom_interval_days, lastLoggedAt[f.id] ?? null);
              const { text: statusText, loggedText, overdue: isOverdue } = followUpStatusText(f.next_reminder, lastLoggedAt[f.id] ?? null, isLogged);
              return (
                <div key={f.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium capitalize">{f.frequency.replace(/_/g, " ")}</p>
                      <p className={`text-xs ${isOverdue ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                        {statusText}
                      </p>
                      {f.note && <p className="text-xs text-muted-foreground italic">"{f.note}"</p>}
                    </div>
                  </div>
                  {!isLogged ? (
                    <>
                      {/* Activity type picker — only shown when due */}
                      <div className="flex flex-wrap gap-1">
                        {ACTIVITY_TYPES.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingActivity(prev => ({
                              ...prev,
                              [f.id]: prev[f.id] === t.value ? "" : t.value,
                            }))}
                            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                              pendingActivity[f.id] === t.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-7 flex-1 text-xs gap-1"
                          disabled={busy || !pendingActivity[f.id]}
                          onClick={() => handleFollowedUp(f)}
                        >
                          <span>✓</span> {pendingActivity[f.id]
                            ? `Log via ${ACTIVITY_TYPES.find(t => t.value === pendingActivity[f.id])?.label ?? pendingActivity[f.id]}`
                            : "Pick a method above"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-stage-3 border-stage-3/30 hover:bg-stage-3/10"
                          disabled={busy}
                          onClick={() => handleDone(f.id)}
                        >
                          Close follow-up
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => handleStop(f.id)}
                        >
                          Stop
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        ✓ {loggedText ?? `Followed up · next reminder ${new Date(f.next_reminder).toLocaleDateString()}`}
                      </p>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-stage-3 border-stage-3/30 hover:bg-stage-3/10"
                          disabled={busy}
                          onClick={() => handleDone(f.id)}
                        >
                          Close follow-up
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => handleStop(f.id)}
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Contact history */}
        {logs.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact history</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-2 py-1 border-b border-border last:border-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-stage-3 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.logged_at).toLocaleDateString(undefined, {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </span>
                  {log.note && (
                    <span className="text-xs text-muted-foreground italic truncate">— {log.note}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
}