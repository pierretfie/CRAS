import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { classifyStageValue } from "@/lib/ai-mock";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

const LOST_REASONS = ["Price", "Timing", "Competitor", "Unresponsive", "Out of scope", "Other"];

function ClientDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: client, refetch } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => (await supabase.from("clients").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: events } = useQuery({
    queryKey: ["events", id],
    queryFn: async () => (await supabase.from("client_stage_events").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
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
            <Badge variant="outline">Stage {client.current_stage}{client.stage_label ? ` · ${client.stage_label}` : ""}</Badge>
            <Badge variant={client.status === "won" ? "default" : client.status === "lost" ? "destructive" : "secondary"}>{client.status}</Badge>
            <Badge variant="outline">{client.category}</Badge>
            {client.product && <Badge variant="outline">{client.product}</Badge>}
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
          <Detail k="Product" v={client.product} />
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
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-primary/50 pl-3 pb-2">
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
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No events yet</p>
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

function EditClientDialog({ client, onSaved }: { client: { id: string; name: string; email: string | null; location: string | null; contact_person: string | null; product: string | null }; onSaved: () => void }) {
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
    product: client.product ?? "",
    customProduct: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const newProduct = form.customProduct.trim() || form.product || null;
    const { error } = await supabase.from("clients").update({
      name: form.name,
      email: form.email || null,
      location: form.location || null,
      contact_person: form.contact_person || null,
      product: newProduct,
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
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Contact Person</Label>
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Product</Label>
            <Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v })}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {products?.map((p: { id: string; name: string }) => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="mt-2"
              placeholder="Or type custom"
              value={form.customProduct}
              onChange={(e) => setForm({ ...form, customProduct: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
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

    const { error: uErr } = await supabase.from("clients").update(update).eq("id", client.id);
    if (uErr) { setSaving(false); return toast.error(uErr.message); }

    const { error: eErr } = await supabase.from("client_stage_events").insert({
      client_id: client.id,
      user_id: u.user.id,
      from_stage: client.current_stage,
      to_stage: mode === "won" ? 3 : mode === "lost" ? null : toStage,
      event_type: eventType,
      description,
      lost_reason: mode === "lost" ? reason : null,
      stage_value: mode === "won" ? 1 : mode === "lost" ? 0 : stageVal,
    });
    setSaving(false);
    if (eErr) return toast.error(eErr.message);
    toast.success("Stage updated");
    setOpen(false);
    setDescription("");
    onSaved();
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
            <Label>What happened</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the update…" />
          </div>
        </div>

        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Push update"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}