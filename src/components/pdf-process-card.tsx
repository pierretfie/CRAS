/**
 * PdfProcessCard — live pipeline card for PDF generation.
 *
 * Steps: generating → processing → compiling → compiling2
 *        → [fixing → recompiling] → ready | error
 *
 * Now also renders post-PDF text (text that appears after %%LATEX_END%%)
 * below the card once the PDF is ready.
 */
import { useState, useRef, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  FileDown,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { compileLatexToPdf } from "@/lib/api/ai.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PdfState =
  | "generating"
  | "processing"
  | "compiling"
  | "compiling2"
  | "fixing"
  | "recompiling"
  | "ready"
  | "error";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS: { key: PdfState; label: string; detail: string }[] = [
  { key: "generating",  label: "Generating LaTeX",           detail: "AI is writing the document…"            },
  { key: "processing",  label: "Sanitizing document",        detail: "Normalizing LaTeX structure…"           },
  { key: "compiling",   label: "Compiling to PDF",           detail: "Running pdflatex pass 1…"               },
  { key: "compiling2",  label: "Finalizing layout",          detail: "Running pdflatex pass 2 (TOC + refs)…"  },
  { key: "fixing",      label: "Auto-fixing errors",         detail: "AI is correcting LaTeX errors…"         },
  { key: "recompiling", label: "Recompiling fixed document", detail: "Running pdflatex on fixed source…"      },
  { key: "ready",       label: "PDF ready",                  detail: ""                                       },
];

const STEP_ORDER: PdfState[] = [
  "generating", "processing", "compiling", "compiling2", "fixing", "recompiling", "ready",
];

const FIX_PATH: PdfState[] = ["fixing", "recompiling"];

// ── Fun facts shown while compiling — keeps the wait feeling alive ────────────
const FUN_FACTS: string[] = [
  "Did you know? Following up within 5 minutes of a lead's first contact can boost conversion by 8x.",
  "Did you know? Most deals are lost not to a competitor, but to no decision at all — a timely follow-up changes that.",
  "Did you know? It typically takes 6-8 touches to turn a cold lead into a qualified one.",
  "Did you know? Personalized follow-up notes (referencing a client's last message) convert noticeably better than generic check-ins.",
  "Did you know? Tuesday and Wednesday are statistically the best days to send a follow-up email.",
  "Did you know? Reps who track interest scores consistently close more deals than those relying on gut feel.",
  "Did you know? A short, specific follow-up message outperforms a long one almost every time.",
  "Did you know? Leads followed up within 24 hours are far more likely to respond than those contacted after 48+.",
];

/** Elapsed seconds — counts up while active, freezes (doesn't reset) when done */
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const frozenRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      // Freeze — keep the last elapsed value, don't reset to 0
      if (startRef.current !== null) {
        frozenRef.current = Math.floor((Date.now() - startRef.current) / 1000);
      }
      return;
    }

    // Starting fresh — only reset if we're coming from a 0 state
    if (startRef.current === null) {
      startRef.current = Date.now();
    }

    setElapsed(Math.floor((Date.now() - startRef.current) / 1000));

    const id = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [active]);

  // When not active, return the frozen value so build time persists
  return active ? elapsed : frozenRef.current;
}

/** Rotates through fun facts every `intervalMs` while `active` is true */
function useRotatingFact(active: boolean, intervalMs = 4500): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    
    // Rotate immediately on mount if active
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % FUN_FACTS.length);
    }, intervalMs);
    
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return FUN_FACTS[index];
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function stepStatus(
  stepKey: PdfState,
  currentState: PdfState,
  usedFix: boolean,
): "done" | "active" | "pending" | "error" | "skipped" {
  if (currentState === "error") {
    const errorAt = STEP_ORDER.indexOf(usedFix ? "recompiling" : "compiling2");
    const idx = STEP_ORDER.indexOf(stepKey);
    if (idx < errorAt) return "done";
    if (idx === errorAt) return "error";
    return "pending";
  }
  if (currentState === "ready") {
    // Fix steps were skipped if we never entered that path
    if (!usedFix && FIX_PATH.includes(stepKey)) return "skipped";
    return "done";
  }
  const stepIdx = STEP_ORDER.indexOf(stepKey);
  const curIdx  = STEP_ORDER.indexOf(currentState);
  if (stepIdx < curIdx) return "done";
  if (stepIdx === curIdx) return "active";
  return "pending";
}

function StepIcon({ status }: { status: ReturnType<typeof stepStatus> }) {
  if (status === "done")    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
  if (status === "active")  return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />;
  if (status === "error")   return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  if (status === "skipped") return <div className="h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground/20 shrink-0" />;
  return <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/20 shrink-0" />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

function prettifyFilename(slug: string): string {
  return slug
    .replace(/^%%FILENAME%%/i, "")
    .replace(/%%/g, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .trim() || "Report";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PdfProcessCardProps {
  pdfState: PdfState;
  pdfError?: string;
  latex?: string | null;
  filename?: string;
  precompiledPdf?: string;
  /** Text streamed after %%LATEX_END%% — rendered below the card once ready */
  postLatexText?: string;
  align?: "start" | "end";
  /** Override the default max-width of the card (default: "max-w-[520px]") */
  maxWidth?: string;
}

export function PdfProcessCard({
  pdfState,
  pdfError,
  latex,
  filename = "report",
  precompiledPdf,
  postLatexText,
  align = "start",
  maxWidth = "max-w-[520px]",
}: PdfProcessCardProps) {
  const [expanded, setExpanded] = useState(true);
  const isActive = pdfState !== "ready" && pdfState !== "error";
  const isReady  = pdfState === "ready";
  const isError  = pdfState === "error";

  const elapsedSeconds = useElapsedSeconds(isActive);
  const currentFact = useRotatingFact(isActive, 8000); // Rotate every 8 seconds

  // Track whether the fix path (fixing/recompiling) was ever entered during
  // this card's lifetime — pdfState only tells us the *current* step, not
  // history, so once we hit "ready" via the happy path we'd otherwise lose
  // the fact that a fix never happened (or did).
  const enteredFixRef = useRef(false);
  if (pdfState === "fixing" || pdfState === "recompiling") {
    enteredFixRef.current = true;
  }
  const usedFix = enteredFixRef.current;

  // Which steps to render — hide fix steps entirely until they become relevant
  const currentIdx = STEP_ORDER.indexOf(pdfState);
  const fixStart   = STEP_ORDER.indexOf("fixing");
  const showFixSteps = usedFix || (currentIdx >= fixStart && !isReady) || isError;
  const visibleSteps = STEPS.filter((s) => showFixSteps || !FIX_PATH.includes(s.key));

  async function getPdf(): Promise<string> {
    if (precompiledPdf) return precompiledPdf;
    if (!latex) throw new Error("No LaTeX source available");
    const { pdf } = await compileLatexToPdf({ data: { latex } });
    return pdf;
  }

  const prettyName = prettifyFilename(filename);

  return (
    <div className={cn("flex flex-col gap-3", align === "end" ? "items-end" : "items-start")}>

      {/* ── Pipeline card ──────────────────────────────────────────────── */}
      <div className={cn(
        "w-full rounded-xl border bg-card shadow-sm overflow-hidden transition-all",
        maxWidth,
        isReady  && "border-emerald-500/30 shadow-emerald-500/5",
        isError  && "border-red-400/30 shadow-red-400/5",
        isActive && "border-blue-500/20",
      )}>

        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
        >
          {/* Status icon */}
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
            isReady  ? "bg-emerald-500/10"   :
            isError  ? "bg-red-400/10"       :
                       "bg-blue-500/10",
          )}>
            {isReady  ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" /> :
             isError  ? <AlertTriangle className="h-4.5 w-4.5 text-red-400" />   :
                        <Loader2 className="h-4.5 w-4.5 text-blue-400 animate-spin" />}
          </div>

          {/* Title */}
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold leading-tight">
                {isReady ? prettyName : isError ? "PDF Compilation Failed" : "Building PDF Report…"}
              </p>
              {elapsedSeconds > 0 && (
                <span className={cn(
                  "shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full tabular-nums",
                  isActive  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                  isReady   ? "bg-emerald-500/10 text-emerald-500/70 border border-emerald-500/20" :
                              "bg-muted text-muted-foreground border border-border",
                )}>
                  {formatElapsed(elapsedSeconds)}
                </span>
              )}
            </div>
            <p className={cn(
              "text-xs mt-0.5 truncate",
              isReady  ? "text-emerald-500"          :
              isError  ? "text-red-400"              :
                         "text-muted-foreground",
            )}>
              {isReady  ? `${prettyName}.pdf — ready to download`          :
               isError  ? (pdfError ?? "Compilation error")                :
               (STEPS.find((s) => s.key === pdfState)?.detail ?? "…")}
            </p>
          </div>

          {/* Chevron */}
          <div className="shrink-0 text-muted-foreground/50">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
        </button>

        {/* Collapsible body */}
        {expanded && (
          <div className="border-t px-4 py-3 space-y-3">

            {/* Step pipeline */}
            <div className="space-y-2.5">
              {visibleSteps.map((step) => {
                const status = stepStatus(step.key, pdfState, showFixSteps);
                const isStepActive = status === "active";
                return (
                  <div key={step.key} className={cn(
                    "flex items-center gap-2.5 transition-opacity",
                    status === "pending"  && "opacity-35",
                    status === "skipped" && "opacity-20",
                  )}>
                    <StepIcon status={status} />
                    <span className={cn(
                      "text-xs",
                      status === "done"    ? "text-foreground"              :
                      status === "active"  ? "text-foreground font-medium"  :
                      status === "error"   ? "text-red-400 font-medium"     :
                                             "text-muted-foreground",
                    )}>
                      {step.label}
                    </span>
                    {isStepActive && step.detail && (
                      <span className="text-xs text-muted-foreground/70 animate-pulse ml-0.5">
                        {step.detail}
                      </span>
                    )}
                    {/* "Auto-fix" badge on the fixing step */}
                    {step.key === "fixing" && status === "active" && (
                      <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        auto-fix
                      </span>
                    )}
                    {step.key === "fixing" && status === "done" && (
                      <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400/70 border border-amber-500/15">
                        fixed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Fun fact ticker — keeps the wait feeling alive on slower steps */}
            {isActive && currentFact && (
              <div
                key={currentFact}
                className={cn(
                  "rounded-lg bg-blue-500/5 border border-blue-500/10 px-3 py-2.5",
                  "animate-in fade-in slide-in-from-bottom-1 duration-500",
                )}
              >
                <p className="text-xs text-muted-foreground/90 leading-relaxed flex items-start gap-2">
                  <Sparkles className="h-3 w-3 text-blue-400/70 mt-0.5 shrink-0" />
                  <span>{currentFact}</span>
                </p>
              </div>
            )}

            {/* Error detail box */}
            {isError && pdfError && (
              <div className="rounded-lg bg-red-500/5 border border-red-400/20 px-3 py-2.5 space-y-1">
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Compilation error</p>
                <pre className="text-xs text-red-300/80 font-mono whitespace-pre-wrap max-h-28 overflow-y-auto leading-relaxed">
                  {pdfError}
                </pre>
              </div>
            )}

            {/* Action buttons */}
            {isReady && (precompiledPdf || latex) && (
              <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                  onClick={async () => {
                    try {
                      const b64 = await getPdf();
                      window.open(b64ToBlobUrl(b64), "_blank");
                    } catch (e: any) { toast.error(e.message || "PDF failed"); }
                  }}
                >
                  <FileText className="h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={async () => {
                    try {
                      const b64 = await getPdf();
                      const url = b64ToBlobUrl(b64);
                      const a = document.createElement("a");
                      a.href = url; a.download = `${filename}.pdf`; a.click();
                      URL.revokeObjectURL(url);
                      toast.success("Downloaded");
                    } catch (e: any) { toast.error(e.message || "PDF failed"); }
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </Button>
                {latex && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const url = URL.createObjectURL(new Blob([latex], { type: "text/plain" }));
                      const a = document.createElement("a");
                      a.href = url; a.download = `${filename}.tex`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5" /> .tex source
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Post-PDF text — rendered after card once ready ──────────────── */}
      {isReady && postLatexText && (
        <div className={cn(
          maxWidth, "w-full",
          "rounded-xl px-4 py-3",
          "bg-muted/30 border border-border/50",
          "text-sm text-foreground leading-relaxed",
          "animate-in fade-in slide-in-from-bottom-2 duration-300",
        )}>
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{postLatexText}</p>
          </div>
        </div>
      )}
    </div>
  );
}