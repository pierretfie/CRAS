import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit, TrendingUp, XCircle, Trophy } from "lucide-react";
import { toast } from "sonner";
import { classifyStageValue } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

const LOST_REASONS = ["Price", "Timing", "Competitor", "Unresponsive", "Out of scope", "Other"];

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: client, refetch } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const res = await query('SELECT * FROM clients WHERE id = $1', [id]);
      if (res.error) throw res.error;
      return res.data && res.data.length > 0 ? res.data[0] : null;
    },
  });
  const { data: events } = useQuery({
    queryKey: ["events", id],
    queryFn: async () => {
      const res = await query('SELECT * FROM client_stage_events WHERE client_id = $1 ORDER BY created_at DESC', [id]);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  if (!client) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/clients"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className={
              client.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
              client.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
              client.current_stage === 3 ? "border-stage-3/30 text-stage-3 bg-stage-3/10" :
              ""
            }>Stage {client.current_stage}{client.stage_label ? ` · ${client.stage_label}` : ""}</Badge>
            <Badge variant={client.status === "won" ? "default" : client.status === "lost" ? "destructive" : "secondary"}>{client.status}</Badge>
            <Badge variant="outline">{client.category}</Badge>
            <Badge variant="outline">{client.mode_of_connection}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <EditClientDialog client={client} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
          {client.status === "active" && (
            <StageUpdateDialog client={client} onSaved={() => { refetch(); qc.invalidateQueries({ queryKey: ["events", id] }); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <Detail k="Email" v={client.email} />
          <Detail k="Location" v={client.location} />
          <Detail k="Contact Person" v={client.contact_person} />
          <Detail k="Contact Email" v={client.contact_person_email} />
          <Detail k="Contact Phone" v={client.contact_person_phone} />
          <Detail k="Contact Role" v={client.contact_person_role} />
          <Detail k="Stage Value" v={String(client.stage_value)} />
          {client.lost_reason && <Detail k="Lost Reason" v={client.lost_reason} />}
          <Detail k="Created" v={new Date(client.created_at).toLocaleDateString()} />
          <Detail k="Updated" v={new Date(client.updated_at).toLocaleDateString()} />
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">{e.event_type}</Badge>
                    {e.from_stage !== null && e.to_stage !== null && (
                      <span>Stage {e.from_stage ?? "—"} → {e.to_stage}</span>
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
            <p className="text-sm text-muted-foreground">No events yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
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

function EditClientDialog({ client, onSaved }: { client: { id: string; name: string; email: string | null; location: string | null; contact_person: string | null; contact_person_email: string | null; contact_person_phone: string | null; contact_person_role: string | null }; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: client.name,
    email: client.email ?? "",
    location: client.location ?? "",
    contact_person: client.contact_person ?? "",
    contact_person_email: client.contact_person_email ?? "",
    contact_person_phone: client.contact_person_phone ?? "",
    contact_person_role: client.contact_person_role ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await query(
        `UPDATE clients SET name = $1, email = $2, location = $3, contact_person = $4, contact_person_email = $5, contact_person_phone = $6, contact_person_role = $7 WHERE id = $8`,
        [form.name, form.email || null, form.location || null, form.contact_person || null, form.contact_person_email || null, form.contact_person_phone || null, form.contact_person_role || null, client.id]
      );
      if (res.error) throw res.error;
      toast.success("Saved");
      setOpen(false);
      onSaved();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Edit className="h-4 w-4 mr-1" />Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Client Details</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Contact Person (optional)</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 col-span-2"><Label>Name</Label><Input placeholder="Contact name" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" placeholder="Optional" value={form.contact_person_email} onChange={(e) => setForm({ ...form, contact_person_email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input type="tel" placeholder="Optional" value={form.contact_person_phone} onChange={(e) => setForm({ ...form, contact_person_phone: e.target.value })} /></div>
              <div className="space-y-1 col-span-2"><Label>Role / Title</Label><Input placeholder="e.g. CEO, Manager" value={form.contact_person_role} onChange={(e) => setForm({ ...form, contact_person_role: e.target.value })} /></div>
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageUpdateDialog({ client, onSaved }: { client: { id: string; current_stage: number }; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"progress" | "won" | "lost">("progress");
  const [toStage, setToStage] = useState(client.current_stage);
  const [description, setDescription] = useState("");
  const [lostReason, setLostReason] = useState("Unresponsive");
  const [customReason, setCustomReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!description.trim()) return toast.error("Describe what happened");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return toast.error("Not signed in"); }

    const reason = lostReason === "Other" ? customReason.trim() : lostReason;
    const stageVal = classifyStageValue(toStage, description);
    const eventType: "progress" | "regress" | "won" | "lost" =
      mode === "won" ? "won" : mode === "lost" ? "lost" : toStage > client.current_stage ? "progress" : "regress";

    const update: { status?: "active" | "won" | "lost"; current_stage?: number; stage_value?: number; lost_reason?: string; stage_notes?: string } = {};
    if (mode === "won") { update.status = "won"; update.current_stage = 3; update.stage_value = 1; }
    else if (mode === "lost") { update.status = "lost"; update.lost_reason = reason; }
    else { update.current_stage = toStage; update.stage_value = stageVal; update.stage_notes = description; }

    // Update clients table
    const status = update.status ?? null;
    const current_stage = update.current_stage ?? null;
    const stage_value = update.stage_value ?? null;
    const lost_reason = update.lost_reason ?? null;
    const stage_notes = update.stage_notes ?? null;
    const clientRes = await query(
      `UPDATE clients SET status = $1, current_stage = $2, stage_value = $3, lost_reason = $4, stage_notes = $5 WHERE id = $6`,
      [status, current_stage, stage_value, lost_reason, stage_notes, client.id]
    );
    if (clientRes.error) {
      setSaving(false);
      return toast.error(clientRes.error.message);
    }

    // Insert into client_stage_events
    const toStageVal = mode === "won" ? 3 : mode === "lost" ? null : toStage;
    const stageValInsert = mode === "won" ? 1 : mode === "lost" ? 0 : stageVal;
    const lostReasonInsert = mode === "lost" ? reason : null;
    const eventRes = await query(
      `INSERT INTO client_stage_events (client_id, user_id, from_stage, to_stage, event_type, description, lost_reason, stage_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [client.id, u.user.id, client.current_stage, toStageVal, eventType, description, lostReasonInsert, stageValInsert]
    );
    if (eventRes.error) {
      setSaving(false);
      return toast.error(eventRes.error.message);
    }
    setSaving(false);
    toast.success("Stage updated");
    setOpen(false);
    setDescription("");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><TrendingUp className="h-4 w-4 mr-1" />Update Stage</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Stage</DialogTitle>
          <DialogDescription>Describe what happened. Mark Won when onboarded, Lost when negotiations break down.</DialogDescription>
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
            <Label>What happened?</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the update…" />
          </div>
        </div>

        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Push update"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
