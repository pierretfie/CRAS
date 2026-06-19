import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { normalizeClientPayload } from "@/lib/ai-mock";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/clients/new")({
  component: NewClient,
});

const DEFAULT_MODES = ["Social Media", "Company Website", "Referral", "Direct Approach", "Email", "WhatsApp"];

function NewClient() {
  const navigate = useNavigate();

  const { data: categories } = useQuery({
    queryKey: ["admin_categories"],
    queryFn: async () => (await supabase.from("admin_categories").select("*").order("name")).data ?? [],
  });
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => (await supabase.from("admin_products").select("*").order("name")).data ?? [],
  });
  const { data: stages } = useQuery({
    queryKey: ["stage_config"],
    queryFn: async () => (await supabase.from("conversion_stage_config").select("*").order("stage_number")).data ?? [],
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    location: "",
    contact_person: "",
    category: "",
    customCategory: "",
    mode: "",
    customMode: "",
    product: "",
    customProduct: "",
    stage: 1,
    stage_notes: "",
  });
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>([]);
  const [preview, setPreview] = useState<null | ReturnType<typeof normalizeClientPayload>>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function runAI() {
    const cat = form.customCategory.trim() || form.category;
    const mode = form.customMode.trim() || form.mode;
    if (!form.name.trim()) return toast.error("Name required");
    if (!cat) return toast.error("Category required");
    if (!mode) return toast.error("Mode of connection required");
    if (!form.stage_notes.trim()) return toast.error("Describe the current stage");
    const stageLabel = stages?.find((s) => s.stage_number === form.stage)?.label ?? "";
    const result = normalizeClientPayload({
      category: cat,
      modeOfConnection: mode,
      stage: form.stage,
      stageDescription: form.stage_notes,
      stageLabel,
    });
    setPreview(result);
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return toast.error("Not signed in"); }

    const cf: Record<string, string> = {};
    customFields.forEach((kv) => { if (kv.key.trim()) cf[kv.key.trim()] = kv.value; });

    const { data: client, error } = await supabase.from("clients").insert({
      name: form.name.trim(),
      email: form.email.trim() || null,
      location: form.location.trim() || null,
      contact_person: form.contact_person.trim() || null,
      category: preview.category,
      mode_of_connection: preview.modeOfConnection,
      current_stage: form.stage,
      stage_value: preview.stageValue,
      stage_label: preview.stageLabel ?? null,
      stage_notes: form.stage_notes,
      product: form.customProduct.trim() || form.product || null,
      custom_fields: cf,
      created_by: u.user.id,
    }).select("id").single();

    if (error || !client) {
      setSaving(false);
      console.error(error);
      return toast.error(error?.message ?? "Failed to save");
    }

    await supabase.from("client_stage_events").insert({
      client_id: client.id,
      user_id: u.user.id,
      from_stage: null,
      to_stage: form.stage,
      event_type: "note",
      description: form.stage_notes,
      stage_value: preview.stageValue,
    });
    await supabase.from("client_interactions").insert({
      user_id: u.user.id,
      client_id: client.id,
      note: "Created client",
    });

    toast.success("Client saved");
    navigate({ to: "/clients/$id", params: { id: client.id } });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Client</h1>
        <p className="text-sm text-muted-foreground">The AI will normalize and classify before saving.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Client Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
          <Field label="Contact Person"><Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Classification</CardTitle><CardDescription>Pick from presets or add your own</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Product">
            <Select value={form.product} onValueChange={(v) => set("product", v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {products?.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" placeholder="Or type custom" value={form.customProduct} onChange={(e) => set("customProduct", e.target.value)} />
          </Field>

          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" placeholder="Or type custom" value={form.customCategory} onChange={(e) => set("customCategory", e.target.value)} />
          </Field>

          <Field label="Mode of Connection">
            <Select value={form.mode} onValueChange={(v) => set("mode", v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {DEFAULT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" placeholder="Or type custom (fb, ig, …)" value={form.customMode} onChange={(e) => set("customMode", e.target.value)} />
          </Field>

          <Field label="Stage">
            <Select value={String(form.stage)} onValueChange={(v) => set("stage", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages?.map((s) => <SelectItem key={s.id} value={String(s.stage_number)}>{s.stage_number}. {s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Stage Description (free text)">
            <Textarea rows={3} value={form.stage_notes} onChange={(e) => set("stage_notes", e.target.value)} placeholder="What's the status right now?" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Fields</CardTitle>
          <CardDescription>Any extra data you want to track</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {customFields.map((kv, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Field" value={kv.key} onChange={(e) => setCustomFields((arr) => arr.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
              <Input placeholder="Value" value={kv.value} onChange={(e) => setCustomFields((arr) => arr.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setCustomFields((arr) => arr.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setCustomFields((arr) => [...arr, { key: "", value: "" }])}>
            <Plus className="h-4 w-4 mr-1" />Add field
          </Button>
        </CardContent>
      </Card>

      {!preview ? (
        <div className="flex justify-end">
          <Button onClick={runAI}><Sparkles className="h-4 w-4 mr-2" />Normalize with AI</Button>
        </div>
      ) : (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />AI Preview</CardTitle>
            <CardDescription>Review what will be saved</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Category" v={preview.category} />
            <Row k="Mode of Connection" v={preview.modeOfConnection} />
            <Row k="Stage" v={`${form.stage}${preview.stageLabel ? ` · ${preview.stageLabel}` : ""}`} />
            <Row k="Stage Value" v={<Badge variant={preview.stageValue ? "default" : "outline"}>{preview.stageValue} {preview.stageValue ? "(progress)" : "(preliminary)"}</Badge>} />
            <p className="text-xs text-muted-foreground pt-2 italic">{preview.reasoning}</p>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Edit</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Confirm & Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-border pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
