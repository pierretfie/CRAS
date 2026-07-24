import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { parseCsv, ParsedClient, CSV_TEMPLATE_EXAMPLE } from "@/lib/csv-parser";
import { batchNormalizeClients } from "@/lib/api/ai.functions";
import { createFollowUp, suggestFrequency } from "@/lib/follow-ups";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Trash2,
  Users,
  Lightbulb,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "upload" | "review" | "saving" | "done";

interface ReviewRow extends ParsedClient {
  _id: string; // local key
  // AI-filled fields
  normalizedCategory: string;
  normalizedMode: string;
  normalizedStage: number;
  stageValue: number;
  normalizedDescription: string;
  // flags
  needsCategory: boolean;
  needsStageNotes: boolean;
  // follow-up (per-row)
  followUpEnabled: boolean;
  followUpFrequency: string;
  // save state
  saved: boolean;
  error: string | null;
}

interface CsvImportDrawerProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const DEFAULT_MODES = [
  "Social Media", "Company Website", "Website Form", "Referral",
  "Direct Approach", "Email", "WhatsApp",
  "Facebook", "Instagram", "LinkedIn", "X (Twitter)",
];


// ─── Component ───────────────────────────────────────────────────────────────

export function CsvImportDrawer({ open, onClose, onImported }: CsvImportDrawerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [normalizing, setNormalizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { data: me } = useCurrentUser();
  const companyId = me?.company?.id;

  const { data: categories } = useQuery({
    queryKey: ["admin_categories", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await query("SELECT * FROM admin_categories WHERE company_id = $1 ORDER BY name", [companyId]);
      if (res.error) throw res.error;
      return (res.data ?? []) as { id: string; name: string }[];
    },
    enabled: !!companyId,
  });

  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () =>
      ((await supabase.from("admin_products").select("*").order("name")).data ?? []) as {
        id: string;
        name: string;
      }[],
  });

  const { data: stages } = useQuery({
    queryKey: ["stage_config", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await query("SELECT * FROM conversion_stage_config WHERE company_id = $1 ORDER BY stage_number", [companyId]);
      if (res.error) throw res.error;
      return (res.data ?? []) as { id: string; stage_number: number; label: string }[];
    },
    enabled: !!companyId,
  });

  function reset() {
    setStep("upload");
    setRows([]);
  }

  function handleClose() {
    reset();
    onClose();
  }


  // ── File handling ──────────────────────────────────────────────────────────

  async function processFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.error("No client rows found. Make sure the CSV has a header row and at least one data row.");
      return;
    }
    if (parsed.length > 100) {
      toast.error("Maximum 100 clients per import. Please split your file.");
      return;
    }

    // Filter rows without a name
    const valid = parsed.filter(r => r.name.trim());
    if (valid.length === 0) {
      toast.error("No rows with a client name found. Ensure the 'name' column is filled.");
      return;
    }
    if (valid.length < parsed.length) {
      toast.info(`${parsed.length - valid.length} row(s) skipped — missing name.`);
    }

    // Run batch AI normalization
    setNormalizing(true);
    setStep("review");
    const stageLabels: Record<string, string> = {};
    stages?.forEach(s => { stageLabels[String(s.stage_number)] = s.label; });

    try {
      const normalized = await batchNormalizeClients({
        data: {
          rows: valid.map(r => ({
            name: r.name,
            category: r.category,
            modeOfConnection: r.mode_of_connection,
            stage: r.stage,
            stageNotes: r.stage_notes,
            interestScale: r.interest_scale,
          })),
          stageLabels,
        },
      });

      setRows(
        valid.map((r, i) => {
          const n = normalized[i];
          return {
            ...r,
            _id: crypto.randomUUID(),
            normalizedCategory: n.category,
            normalizedMode: n.modeOfConnection,
            normalizedStage: n.stage,
            stageValue: n.stageValue,
            normalizedDescription: n.normalizedDescription,
            needsCategory: n.needsCategory,
            needsStageNotes: n.needsStageNotes,
            followUpEnabled: false,
            followUpFrequency: suggestFrequency(r.interest_scale, n.stage),
            saved: false,
            error: null,
          };
        }),
      );
    } catch (err: any) {
      toast.error(err.message || "AI normalization failed");
      setStep("upload");
    } finally {
      setNormalizing(false);
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }


  // ── Row editing helpers ────────────────────────────────────────────────────

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setRows(rs => rs.map(r => (r._id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows(rs => rs.filter(r => r._id !== id));
  }

  // ── Save all ───────────────────────────────────────────────────────────────

  async function saveAll() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Not signed in");

    setSaving(true);
    setStep("saving");
    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      if (row.saved) continue;
      try {
        const stageLabel =
          stages?.find(s => s.stage_number === row.normalizedStage)?.label ?? null;

        const { data: client, error } = await supabase
          .from("clients")
          .insert({
            name: row.name.trim(),
            email: row.email.trim() || null,
            location: row.location.trim() || null,
            contact_person: row.contact_person.trim() || null,
            contact_person_phone: row.contact_person_phone.trim() || null,
            contact_person_email: row.contact_person_email.trim() || null,
            contact_person_role: row.contact_person_role.trim() || null,
            category: row.normalizedCategory,
            mode_of_connection: row.normalizedMode,
            product: row.product.trim() || null,
            current_stage: row.normalizedStage,
            stage_value: row.stageValue,
            stage_label: stageLabel,
            stage_notes: row.normalizedDescription,
            interest_scale: row.interest_scale,
            custom_fields: {},
            created_by: u.user.id,
          })
          .select("id")
          .single();

        if (error || !client) throw new Error(error?.message ?? "Insert failed");

        await supabase.from("client_stage_events").insert({
          client_id: client.id,
          user_id: u.user.id,
          from_stage: null,
          to_stage: row.normalizedStage,
          event_type: "progress",
          description: row.normalizedDescription,
          lost_reason: null,
          stage_value: row.stageValue,
          interest_scale: row.interest_scale,
        });

        updateRow(row._id, { saved: true, error: null });
        successCount++;

        if (row.followUpEnabled) {
          try {
            await createFollowUp(client.id, u.user.id, row.followUpFrequency, null);
          } catch {
            // follow-up failure is non-fatal
          }
        }
      } catch (err: any) {
        updateRow(row._id, { error: err.message || "Failed" });
        failCount++;
      }
    }

    setSaving(false);
    setStep("done");

    if (successCount > 0) {
      toast.success(`${successCount} client${successCount > 1 ? "s" : ""} imported successfully`);
      onImported();
    }
    if (failCount > 0) {
      toast.error(`${failCount} client${failCount > 1 ? "s" : ""} failed to save`);
    }
  }


  // ── Download template ──────────────────────────────────────────────────────

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE_EXAMPLE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cras-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const flaggedCount = rows.filter(r => r.needsCategory || r.needsStageNotes).length;
  const unsavedCount = rows.filter(r => !r.saved).length;
  const savedCount = rows.filter(r => r.saved).length;

  // A row is "incomplete" if any field the DB requires is blank
  const incompleteRows = rows.filter(r =>
    !r.saved && (
      !r.name.trim() ||
      !r.normalizedCategory.trim() ||
      !r.normalizedMode.trim() ||
      !r.normalizedDescription.trim() ||
      !r.normalizedStage ||
      !r.product.trim()
    )
  );
  const hasIncomplete = incompleteRows.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={o => !o && handleClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full"
      >
        <div className="p-6 border-b">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              Import Clients via CSV
            </SheetTitle>
            <SheetDescription>
              Upload a CSV — AI extracts and fills all fields, then you confirm before saving.
            </SheetDescription>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">

            {/* ── UPLOAD STEP ─────────────────────────────────── */}
            {(step === "upload" || step === "review") && rows.length === 0 && !normalizing && (
              <UploadStep
                dragOver={dragOver}
                setDragOver={setDragOver}
                onDrop={onDrop}
                fileRef={fileRef}
                onFileInput={onFileInput}
                onDownloadTemplate={downloadTemplate}
              />
            )}

            {/* ── NORMALIZING ─────────────────────────────────── */}
            {normalizing && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">AI is reading your CSV and filling in all fields…</p>
                <p className="text-xs">This takes a few seconds</p>
              </div>
            )}

            {/* ── REVIEW TABLE ─────────────────────────────────── */}
            {rows.length > 0 && (step === "review" || step === "saving" || step === "done") && (
              <ReviewStep
                rows={rows}
                categories={categories ?? []}
                products={products ?? []}
                stages={stages ?? []}
                step={step}
                flaggedCount={flaggedCount}
                updateRow={updateRow}
                removeRow={removeRow}
              />
            )}

          </div>
        </ScrollArea>

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <div className="p-4 border-t bg-background flex items-center justify-between gap-3">
          {step === "upload" || (rows.length === 0 && !normalizing) ? (
            <p className="text-xs text-muted-foreground">Supports .csv files up to 100 rows</p>
          ) : step === "done" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{savedCount} saved · {rows.filter(r => r.error).length} errors</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {hasIncomplete ? (
                <span className="text-amber-600">
                  {incompleteRows.length} client{incompleteRows.length > 1 ? "s" : ""} missing required fields
                </span>
              ) : flaggedCount > 0 ? (
                <span>{rows.length} client{rows.length !== 1 ? "s" : ""} ready · {flaggedCount} need attention</span>
              ) : (
                <span>{rows.length} client{rows.length !== 1 ? "s" : ""} ready to save</span>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {step === "done" ? (
              <>
                {rows.some(r => r.error) && (
                  <Button variant="outline" size="sm" onClick={() => setStep("review")}>
                    Review Errors
                  </Button>
                )}
                <Button size="sm" onClick={handleClose}>Done</Button>
              </>
            ) : rows.length > 0 && !normalizing ? (
              <>
                <Button variant="outline" size="sm" onClick={reset}>
                  Start Over
                </Button>
                <Button
                  size="sm"
                  onClick={saveAll}
                  disabled={saving || unsavedCount === 0 || hasIncomplete}
                  title={hasIncomplete ? "Fill in required fields before saving" : undefined}
                  className={hasIncomplete ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}
                >
                  {saving ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</>
                  ) : (
                    <>Confirm & Save {unsavedCount} Client{unsavedCount !== 1 ? "s" : ""}</>
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


// ─── Upload Step ─────────────────────────────────────────────────────────────

function UploadStep({
  dragOver,
  setDragOver,
  onDrop,
  fileRef,
  onFileInput,
  onDownloadTemplate,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-colors cursor-pointer",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <p className="font-semibold">Drop your CSV here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">AI will map columns and fill missing fields automatically</p>
        </div>
        <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>
          <FileText className="h-4 w-4 mr-2" />Browse CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileInput} />
      </div>

      {/* AI helper tip */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs font-semibold text-foreground">Don't have a CSV yet?</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Use AI tools like <span className="font-medium text-foreground">ChatGPT</span>, <span className="font-medium text-foreground">Claude</span>, or <span className="font-medium text-foreground">Gemini</span> to convert your existing notes, images, or contact lists into a CSV — just paste or upload your data and ask it to format as a spreadsheet. You can also use file conversion tools like <span className="font-medium text-foreground">Convertio</span> or <span className="font-medium text-foreground">Google Sheets</span> to convert Excel or other formats to CSV.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
        <ul className="text-sm space-y-1.5 text-muted-foreground">
          <li className="flex gap-2"><span className="text-primary font-bold">1.</span> Upload any CSV — column names don't have to be exact</li>
          <li className="flex gap-2"><span className="text-primary font-bold">2.</span> AI maps fields, normalizes categories &amp; channels, and writes stage descriptions</li>
          <li className="flex gap-2"><span className="text-primary font-bold">3.</span> You review and edit each client before confirming</li>
          <li className="flex gap-2"><span className="text-primary font-bold">4.</span> All clients are saved in one go</li>
        </ul>
      </div>

      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onDownloadTemplate}>
        <Download className="h-4 w-4 mr-2" />Download CSV template
      </Button>
    </div>
  );
}


// ─── Review Step ─────────────────────────────────────────────────────────────

function ReviewStep({
  rows,
  categories,
  products,
  stages,
  step,
  flaggedCount,
  updateRow,
  removeRow,
}: {
  rows: ReviewRow[];
  categories: { id: string; name: string }[];
  products: { id: string; name: string }[];
  stages: { id: string; stage_number: number; label: string }[];
  step: Step;
  flaggedCount: number;
  updateRow: (id: string, patch: Partial<ReviewRow>) => void;
  removeRow: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <div className="text-sm">
          <span className="font-semibold">{rows.length} clients extracted</span>
          {flaggedCount > 0 && (
            <span className="text-amber-600 ml-2">· {flaggedCount} row{flaggedCount > 1 ? "s" : ""} need your attention</span>
          )}
          {flaggedCount === 0 && <span className="text-muted-foreground ml-2">· All fields filled — review and confirm</span>}
        </div>
      </div>

      {/* Client cards */}
      {rows.map((row, idx) => (
        <ClientReviewCard
          key={row._id}
          row={row}
          index={idx}
          categories={categories}
          products={products}
          stages={stages}
          step={step}
          updateRow={updateRow}
          removeRow={removeRow}
        />
      ))}
    </div>
  );
}


// ─── Client Review Card ───────────────────────────────────────────────────────

function ClientReviewCard({
  row,
  index,
  categories,
  products,
  stages,
  step,
  updateRow,
  removeRow,
}: {
  row: ReviewRow;
  index: number;
  categories: { id: string; name: string }[];
  products: { id: string; name: string }[];
  stages: { id: string; stage_number: number; label: string }[];
  step: Step;
  updateRow: (id: string, patch: Partial<ReviewRow>) => void;
  removeRow: (id: string) => void;
}) {
  const [contactExpanded, setContactExpanded] = useState(false);
  const editable = step === "review";
  const hasFlaggedFields = row.needsCategory || row.needsStageNotes;

  // Merge AI-suggested value into category list without duplicating
  const categoryOptions = categories.some(c => c.name === row.normalizedCategory)
    ? categories
    : [...categories, { id: "__ai__", name: row.normalizedCategory }];

  const cardClass = cn(
    "rounded-xl border p-4 space-y-3 transition-colors",
    row.saved && "border-green-500/40 bg-green-500/5",
    row.error && "border-destructive/40 bg-destructive/5",
    hasFlaggedFields && !row.saved && !row.error && "border-amber-500/40 bg-amber-500/5",
    !row.saved && !row.error && !hasFlaggedFields && "border-border",
  );

  return (
    <div className={cardClass}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-muted-foreground shrink-0">#{index + 1}</span>
          {editable ? (
            <Input
              value={row.name}
              onChange={e => updateRow(row._id, { name: e.target.value })}
              className="font-semibold h-7 text-sm py-0"
              placeholder="Client name *"
            />
          ) : (
            <p className="font-semibold truncate">{row.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {row.saved && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {row.error && <AlertCircle className="h-4 w-4 text-destructive" title={row.error} />}
          {hasFlaggedFields && !row.saved && !row.error && (
            <AlertCircle className="h-4 w-4 text-amber-500" title="Needs review" />
          )}
          {editable && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row._id)}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {row.error && <p className="text-xs text-destructive">{row.error}</p>}

      {/* ── Row 1: Category · Stage · Channel ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <p className={cn("text-xs font-medium", row.needsCategory && "text-amber-600")}>
            Category {row.needsCategory && "⚠"}
          </p>
          {editable ? (
            <Select
              value={row.normalizedCategory}
              onValueChange={v => updateRow(row._id, { normalizedCategory: v, needsCategory: false })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-xs">{row.normalizedCategory}</Badge>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Stage</p>
          {editable ? (
            <Select
              value={String(row.normalizedStage)}
              onValueChange={v => updateRow(row._id, { normalizedStage: Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={String(s.stage_number)}>
                    {s.stage_number}. {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary" className="text-xs">Stage {row.normalizedStage}</Badge>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Channel</p>
          {editable ? (
            <Select
              value={row.normalizedMode}
              onValueChange={v => updateRow(row._id, { normalizedMode: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFAULT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                {!DEFAULT_MODES.includes(row.normalizedMode) && (
                  <SelectItem value={row.normalizedMode}>{row.normalizedMode}</SelectItem>
                )}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="text-xs">{row.normalizedMode}</Badge>
          )}
        </div>
      </div>

      {/* ── Row 2: Product · Interest ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <p className={cn("text-xs font-medium", !row.product && "text-amber-600")}>
            Product {!row.product && "⚠"}
          </p>
          {editable ? (
            <>
              <Select
                value={row.product}
                onValueChange={v => updateRow(row._id, { product: v === "__clear__" ? "" : v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {row.product && products.some(p => p.name === row.product) && (
                    <SelectItem value="__clear__" className="text-muted-foreground italic">Clear selection</SelectItem>
                  )}
                  {products.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-7 text-xs mt-1"
                placeholder="Or type custom"
                value={products.some(p => p.name === row.product) ? "" : row.product}
                onChange={e => updateRow(row._id, { product: e.target.value })}
              />
            </>
          ) : (
            <Badge variant="outline" className="text-xs">{row.product || "—"}</Badge>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Interest Scale ({row.interest_scale.toFixed(1)}/10)</p>
          <div className="pt-1">
            <input
              type="range" min={1} max={10} step={0.1}
              value={row.interest_scale}
              disabled={!editable}
              onChange={e => updateRow(row._id, { interest_scale: parseFloat(e.target.value) })}
              className="w-full h-2 accent-primary disabled:opacity-50"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>Unqualified</span>
              <span>Engaged</span>
              <span>High-Priority</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stage description ── */}
      <div className="space-y-1">
        <p className={cn("text-xs font-medium", row.needsStageNotes && "text-amber-600")}>
          Stage Description {row.needsStageNotes && "⚠ — add context"}
        </p>
        {editable ? (
          <Textarea
            rows={2}
            value={row.normalizedDescription}
            onChange={e => updateRow(row._id, { normalizedDescription: e.target.value, needsStageNotes: false })}
            className="text-xs resize-none"
            placeholder="What's the current status with this client?"
          />
        ) : (
          <p className="text-xs text-muted-foreground">{row.normalizedDescription}</p>
        )}
      </div>

      {/* ── Follow-up toggle ── */}
      {editable && (
        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bell className="h-3.5 w-3.5" />
            <span>Follow-up</span>
            {row.followUpEnabled && (
              <Select
                value={row.followUpFrequency}
                onValueChange={v => updateRow(row._id, { followUpFrequency: v })}
              >
                <SelectTrigger className="h-6 text-xs border-0 bg-muted px-2 py-0 w-auto gap-1 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="every_2_days">Every 2 days</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <Switch
            checked={row.followUpEnabled}
            onCheckedChange={v => updateRow(row._id, { followUpEnabled: v })}
            className="scale-75"
          />
        </div>
      )}

      {/* ── Contact details — collapsible ── */}
      {editable && (
        <div className="border-t pt-2">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            onClick={() => setContactExpanded(e => !e)}
          >
            <span>{contactExpanded ? "▾" : "▸"}</span>
            Contact details
            {(row.email || row.contact_person || row.location) && (
              <span className="ml-1 text-primary">· filled from CSV</span>
            )}
          </button>
          {contactExpanded && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <MiniField label="Email" value={row.email} onChange={v => updateRow(row._id, { email: v })} />
              <MiniField label="Location" value={row.location} onChange={v => updateRow(row._id, { location: v })} />
              <MiniField label="Contact Person" value={row.contact_person} onChange={v => updateRow(row._id, { contact_person: v })} />
              <MiniField label="Phone" value={row.contact_person_phone} onChange={v => updateRow(row._id, { contact_person_phone: v })} />
              <MiniField label="Contact Email" value={row.contact_person_email} onChange={v => updateRow(row._id, { contact_person_email: v })} />
              <MiniField label="Contact Role" value={row.contact_person_role} onChange={v => updateRow(row._id, { contact_person_role: v })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      <Input value={value} onChange={e => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}
