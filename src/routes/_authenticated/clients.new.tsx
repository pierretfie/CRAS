import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useState } from "react";
import { normalizeClientData } from "@/lib/api/ai.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InterestScaleSlider } from "@/components/interest-scale-slider";
import { CsvImportDrawer } from "@/components/csv-import-drawer";
import { Plus, Sparkles, Trash2, Bell, Upload } from "lucide-react";
import { notifyNewClient } from "@/lib/notify";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { createFollowUp } from "@/lib/follow-ups";

export const Route = createFileRoute("/_authenticated/clients/new")({
  component: NewClient,
});

const DEFAULT_MODES = ["Social Media", "Company Website", "Website Form", "Referral", "Direct Approach", "Email", "WhatsApp"];

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

function NewClient() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [csvDrawerOpen, setCsvDrawerOpen] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["admin_categories"],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_categories ORDER BY name');
      if (res.error) throw res.error;
      return res.data;
    },
  });
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => (await supabase.from("admin_products").select("*").order("name")).data ?? [],
  });
  const { data: stages } = useQuery({
    queryKey: ["stage_config"],
    queryFn: async () => {
      const res = await query('SELECT * FROM conversion_stage_config ORDER BY stage_number');
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    location: "",
    contact_person: "",
    contact_person_email: "",
    contact_person_phone: "",
    contact_person_role: "",
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
  const [preview, setPreview] = useState<null | { category: string; modeOfConnection: string; stageValue: number; stageLabel?: string; reasoning: string }>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [interestScale, setInterestScale] = useState(5);
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpFrequency, setFollowUpFrequency] = useState("daily");
  const [followUpNote, setFollowUpNote] = useState("");
  const [directActivityType, setDirectActivityType] = useState("");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function runAI() {
    const cat = form.customCategory.trim() || form.category;
    const mode = form.customMode.trim() || form.mode;
    if (!form.name.trim()) return toast.error("Name required");
    if (!cat) return toast.error("Category required");
    if (!mode) return toast.error("Mode of connection required");
    if (!form.stage_notes.trim()) return toast.error("Describe the current stage");
    if (
      (form.mode === "Direct Approach" || form.customMode.toLowerCase().includes("direct")) &&
      !directActivityType
    ) return toast.error("Pick how you reached out before continuing");
    const stageLabel = stages?.find((s: any) => s.stage_number === form.stage)?.label ?? "";
    setNormalizing(true);
    try {
      const result = await normalizeClientData({
        data: {
          category: cat,
          modeOfConnection: mode,
          stage: form.stage,
          stageDescription: form.stage_notes,
          stageLabel,
          interestScale,
        },
      });
      setPreview(result);
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to run AI normalization");
    } finally {
      setNormalizing(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setSaving(false); return toast.error("Not signed in"); }

      const cf: Record<string, string> = {};
      customFields.forEach((kv) => { if (kv.key.trim()) cf[kv.key.trim()] = kv.value; });

      const { data: client, error } = await supabase.from("clients").insert({
        name: form.name.trim(),
        email: form.email.trim() || null,
        location: form.location.trim() || null,
        contact_person: form.contact_person.trim() || null,
        contact_person_phone: form.contact_person_phone.trim() || null,
        contact_person_email: form.contact_person_email.trim() || null,
        contact_person_role: form.contact_person_role.trim() || null,
        category: preview.category,
        mode_of_connection: preview.modeOfConnection,
        product: form.customProduct.trim() || form.product || null,
        current_stage: form.stage,
        stage_value: preview.stageValue,
        stage_label: preview.stageLabel ?? null,
        stage_notes: preview.normalizedDescription,
        custom_fields: cf,
        interest_scale: interestScale,
        created_by: u.user.id,
      }).select("id").single();

      if (error || !client) {
        toast.error(error?.message ?? "Failed to save client");
      } else {
        // Insert initial stage event so the description appears in the timeline
        await supabase.from("client_stage_events").insert({
          client_id: client.id,
          user_id: u.user.id,
          from_stage: null,
          to_stage: form.stage,
          event_type: "progress",
          description: preview.normalizedDescription,
          lost_reason: null,
          stage_value: preview.stageValue,
          activity_type: directActivityType || null,
          interest_scale: interestScale,
        });

        // Notify admins (fire-and-forget)
        try {
          const { data: profileData } = await supabase.from("profiles").select("name").eq("id", u.user.id).single();
          const byName: string = (profileData as any)?.name ?? "Someone";
          notifyNewClient(
            client.id,
            form.name.trim(),
            byName,
            form.customProduct.trim() || form.product || null,
            form.stage
          );
        } catch { /* non-critical */ }

        if (followUpEnabled) {
          try {
            await createFollowUp(client.id, u.user.id, followUpFrequency, followUpNote.trim() || null);
            toast.success("Client created with follow-up scheduled");
          } catch {
            toast.success("Client created");
            toast.error("Failed to schedule follow-up");
          }
        } else {
          toast.success("Client created");
        }
        navigate({ to: "/clients" });
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Client</h1>
          <p className="text-sm text-muted-foreground">The AI will normalize and classify before saving.</p>
        </div>
        <Button
          onClick={() => setCsvDrawerOpen(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm gap-2"
        >
          <Upload className="h-4 w-4" />
          Import via CSV
        </Button>
      </div>

      <CsvImportDrawer
        open={csvDrawerOpen}
        onClose={() => setCsvDrawerOpen(false)}
        onImported={() => {
          qc.invalidateQueries({ queryKey: ["clients"] });
          navigate({ to: "/clients" });
        }}
      />

      <Card>
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Client Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
          <Field label="Contact Person"><Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="Name" /></Field>
          <Field label="Contact Person Email"><Input type="email" value={form.contact_person_email} onChange={(e) => set("contact_person_email", e.target.value)} placeholder="Optional" /></Field>
          <Field label="Contact Person Phone"><Input type="tel" value={form.contact_person_phone} onChange={(e) => set("contact_person_phone", e.target.value)} placeholder="Optional" /></Field>
          <Field label="Contact Person Role"><Input value={form.contact_person_role} onChange={(e) => set("contact_person_role", e.target.value)} placeholder="e.g. CEO, Manager" /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Classification</CardTitle><CardDescription>Pick from presets or add your own</CardDescription></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Field label="Product">
            <Select value={form.product} onValueChange={(v) => set("product", v === "__clear__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {form.product && <SelectItem value="__clear__" className="text-muted-foreground italic">Clear selection</SelectItem>}
                {products?.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" placeholder="Or type custom" value={form.customProduct} onChange={(e) => set("customProduct", e.target.value)} />
          </Field>

          <div className="space-y-2 md:col-span-2">
            <InterestScaleSlider value={interestScale} onChange={setInterestScale} />
          </div>

          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => set("category", v === "__clear__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {form.category && <SelectItem value="__clear__" className="text-muted-foreground italic">Clear selection</SelectItem>}
                {categories?.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" placeholder="Or type custom" value={form.customCategory} onChange={(e) => set("customCategory", e.target.value)} />
          </Field>

          <Field label="Mode of Connection">
            <Select value={form.mode} onValueChange={(v) => { set("mode", v === "__clear__" ? "" : v); setDirectActivityType(""); }}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom" /></SelectTrigger>
              <SelectContent>
                {form.mode && <SelectItem value="__clear__" className="text-muted-foreground italic">Clear selection</SelectItem>}
                {DEFAULT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" placeholder="Or type custom (fb, ig, …)" value={form.customMode} onChange={(e) => set("customMode", e.target.value)} />
          </Field>

          {/* Activity type — shown when mode is Direct Approach */}
          {(form.mode === "Direct Approach" || form.customMode.toLowerCase().includes("direct")) && (
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">How did you reach out?</label>
              <div className="flex flex-wrap gap-1.5">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setDirectActivityType(directActivityType === t.value ? "" : t.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      directActivityType === t.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="Stage">
            <Select value={String(form.stage)} onValueChange={(v) => set("stage", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages?.map((s: any) => <SelectItem key={s.id} value={String(s.stage_number)}>{s.stage_number}. {s.label}</SelectItem>)}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Follow-up
          </CardTitle>
          <CardDescription>Schedule a reminder to follow up with this client</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable follow-up</Label>
            <Switch checked={followUpEnabled} onCheckedChange={setFollowUpEnabled} />
          </div>
          {followUpEnabled && (
            <>
              <Field label="Frequency">
                <Select value={followUpFrequency} onValueChange={setFollowUpFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="every_2_days">Every 2 Days</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Note (optional)">
                <Input
                  placeholder="What to follow up about..."
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                />
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      {!preview ? (
        <div className="flex justify-end">
          {(() => {
            const isDirectApproach = form.mode === "Direct Approach" || form.customMode.toLowerCase().includes("direct");
            const missingMethod = isDirectApproach && !directActivityType;
            return (
              <Button onClick={runAI} disabled={normalizing || missingMethod}>
                {normalizing ? "Normalizing..." : missingMethod ? "Pick a method above" : <><Sparkles className="h-4 w-4 mr-2" />Normalize with AI</>}
              </Button>
            );
          })()}
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
            <Row k="Stage Notes" v={preview.normalizedDescription} />
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
