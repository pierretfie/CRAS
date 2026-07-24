import { Fragment, useEffect, useRef, useState, useCallback, memo } from "react";

/** Auto-scrolling container for streaming reasoning text. */
const ReasoningScrollArea = memo(function ReasoningScrollArea({ text }: { text: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current) el.current.scrollTop = el.current.scrollHeight;
  }, [text]);
  return (
    <div
      ref={el}
      className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto"
    >
      {text}
    </div>
  );
});

/** Regenerate button — pill label slides in, auto-collapses after 10 s, re-expands on hover */
const RegenerateButton = memo(function RegenerateButton({ onClick }: { onClick: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setExpanded(false), 10000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const showLabel = expanded || hovered;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1.5 rounded-full border border-muted-foreground/20 bg-background/70 backdrop-blur-sm px-2 py-1 text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 hover:bg-muted/60 transition-all duration-300 cursor-pointer"
      style={{ opacity: hovered ? 1 : 0.7 }}
    >
      <RotateCcw className="h-3 w-3 shrink-0" />
      <span
        className="overflow-hidden whitespace-nowrap text-xs font-medium transition-all duration-500 ease-in-out"
        style={{ maxWidth: showLabel ? "260px" : "0px", opacity: showLabel ? 1 : 0 }}
      >
        {hovered && !expanded ? "… regenerate response" : "Not the response you wanted?"}
      </span>
    </button>
  );
});
import { useAIDrawer } from "@/hooks/use-ai-drawer";
import { cn } from "@/lib/utils";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { buildAnalyticsContext } from "@/lib/ai-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { ThinkingLevel } from "@/lib/ai-nvidia.server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, User, Send, Sparkles, MessageSquare, Loader2, Trash2, Copy, Square, RotateCcw, Brain, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PdfProcessCard } from "@/components/pdf-process-card";
import type { PdfState } from "@/components/pdf-process-card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  pdfState?: PdfState;
  pdfError?: string;
  precompiledPdf?: string;
  pdfFilename?: string;
}

function extractLatex(text: string): string {
  const startMarker = "%%LATEX_START%%";
  const endMarker = "%%LATEX_END%%";
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx + startMarker.length, endIdx).replace(/^\n/, "").trim();
  }
  const fenceMatch = text.match(/```(?:latex)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text;
}

function splitMessage(text: string): { visible: string; latex: string | null; filename: string } {
  // Match either %%FILENAME%%value%% (closed) or %%FILENAME%%value\n (AI streams without closing %%)
  const fileMatch = text.match(/%%FILENAME%%(.*?)(?:%%|\n|$)/);
  const rawFilename = fileMatch ? fileMatch[1].trim() : "report";
  const filename = rawFilename.replace(/^%%FILENAME%%/i, "").trim() || "report";

  // Use indexOf-based extraction — non-greedy regex fails on large single-line LaTeX bodies
  const startMarker = "%%LATEX_START%%";
  const endMarker = "%%LATEX_END%%";
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const rawLatex = text.slice(startIdx + startMarker.length, endIdx);
    const latex = rawLatex.replace(/^\n/, "").replace(/\n$/, "").trim();
    let visible = text.slice(0, startIdx);
    visible = visible.replace(/%%FILENAME%%[^%]*%%/g, "").replace(/%%[^%\n]*%%?/g, "").trim();
    return { visible, latex: latex || null, filename };
  }

  const fenceMatch = text.match(/(.*?)```(?:latex)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    return { visible: fenceMatch[1].trim(), latex: fenceMatch[2].trim(), filename };
  }
  const visible = text.replace(/%%FILENAME%%[^%]*%%/g, "").replace(/%%[A-Z_]+%%/g, "").trim();
  return { visible, latex: null, filename };
}

const QUICK_PROMPTS = [
  "Give me an executive report",
  "Which connection channel is best?",
  "Show stale clients needing attention",
  "Who should I follow up with first today?",
  "What are our top service categories?",
];

const INTRO_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content:
    "Hi! I'm your CRAS AI Assistant. I can analyze your live CRM dataset, identify stalled deals, recommend channels, and summarize team wins. Ask me anything!",
};

export function AIAssistantDrawer() {
  const { isOpen, close } = useAIDrawer();
  
  const { data: me } = useCurrentUser();
  
  // Always load full team data — filtering causes gaps that mislead the AI.
  // If users want personal analysis, they ask the AI directly and it finds
  // their patterns from the TOP CLOSERS / TOP SOURCERS sections.
  const { data: analytics, isLoading: analyticsLoading } = useAnalyticsData(null, me?.company?.id);

  // Fetch ALL active follow-ups for full context
  const { data: followUpContext } = useQuery({
    queryKey: ["ai-followup-context"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data } = await supabase
        .from("client_follow_ups")
        .select("*, clients!client_follow_ups_client_id_fkey(name, current_stage, interest_scale, stage_notes, status, product)")
        .eq("status", "active")
        .order("next_reminder", { ascending: true });
      return data ?? [];
    },
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem("ai-drawer-chat-history");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [INTRO_MESSAGE];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState<ThinkingLevel>("auto");
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const copyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("ai-assistant-width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 2000) {
          return parsed;
        }
      }
    } catch {
      // Ignored
    }
    return 480;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const widthRef = useRef(width);
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const doResize = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(320, Math.min(window.innerWidth - 64, startWidth - deltaX));
      setWidth(newWidth);
    };

    const stopResize = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", doResize);
      window.removeEventListener("mouseup", stopResize);
      try {
        localStorage.setItem("ai-assistant-width", String(widthRef.current));
      } catch (e) {
        console.error(e);
      }
    };

    window.addEventListener("mousemove", doResize);
    window.addEventListener("mouseup", stopResize);
  };

  // ── Auto-scroll logic ────────────────────────────────────────────────────
  // Tracks whether the user is "stuck to the bottom". While streaming,
  // we only auto-scroll if they haven't manually scrolled up.
  const isAtBottomRef = useRef(true);

  // Listen for manual scroll — mark as no longer at bottom if user scrolls up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // Within 80px of the bottom = consider "at bottom"
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll to bottom whenever messages update — but only if already at bottom
  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  // Always snap to bottom when the drawer opens
  useEffect(() => {
    if (!isOpen) return;
    isAtBottomRef.current = true;
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Persist chat history
  useEffect(() => {
    localStorage.setItem("ai-drawer-chat-history", JSON.stringify(messages));
  }, [messages]);

  // Core send function. Accepts explicit history so retry can pass a clean slice.
  async function sendWithHistory(textToSend: string, history: Message[]) {
    const trimmed = textToSend.trim();
    if (!trimmed || loading || !analytics) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const placeholder: Message = { id: assistantId, role: "assistant", content: "" };

    setMessages([...history, userMsg, placeholder]);
    setInput("");
    setLoading(true);
    // Always snap to bottom when a new exchange starts
    isAtBottomRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const analyticsContext = buildAnalyticsContext(analytics, followUpContext ?? [], me?.profile?.full_name ?? me?.user?.email ?? undefined);

      // Phase 1: stream conversational tokens via SSE
      let streamedText = "";
      let streamedThinking = "";
      let latexDetected = false;
      let latexFullText = "";
      let answerStarted = false;

      const res = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, userMsg]
            .filter((m) => m.content !== "")
            .map((m) => ({ role: m.role, content: m.content })),
          analyticsContext,
          thinking,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === "think_chunk") {
            streamedThinking += event.text as string;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, thinking: streamedThinking } : m),
            );
            // Auto-open the collapsible as soon as reasoning starts
            if (!answerStarted) {
              setExpandedThinking((prev) => new Set(prev).add(assistantId));
            }
          } else if (event.type === "chunk") {
            // First answer token — close the reasoning collapsible
            if (!answerStarted && streamedThinking) {
              answerStarted = true;
              setExpandedThinking((prev) => {
                const next = new Set(prev);
                next.delete(assistantId);
                return next;
              });
            }
            answerStarted = true;
            streamedText += event.text as string;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: streamedText } : m),
            );
          } else if (event.type === "latex_detected") {
            latexDetected = true;
            // Snap visible text to just the part before the LaTeX marker
            const visibleText = (event.visibleText as string) ?? streamedText;
            streamedText = visibleText;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId
                ? { ...m, content: visibleText, pdfState: "generating" as PdfState }
                : m),
            );
          } else if (event.type === "latex_complete") {
            latexFullText = event.fullText as string;
            const { filename: extractedFilename } = splitMessage(latexFullText);
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, pdfFilename: extractedFilename } : m),
            );
          } else if (event.type === "post_latex_text") {
            // Append any text the model wrote after %%LATEX_END%% to the visible message
            const postText = (event.text as string).trim();
            if (postText) {
              streamedText = streamedText ? `${streamedText}\n\n${postText}` : postText;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: streamedText } : m),
              );
            }
          } else if (event.type === "done") {
            break outer;
          } else if (event.type === "error") {
            throw new Error((event.message as string) || "Stream error");
          }
        }
      }

      if (!latexDetected) {
        // Plain conversational response — done
        return;
      }

      // Stream is done — stop the spinner before the compile phase starts
      setLoading(false);

      // Phase 2: Compile the LaTeX received silently in background
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, pdfState: "processing" as PdfState } : m),
      );

      const { compileLatexToPdf } = await import("@/lib/api/ai.functions");
      console.log("[PDF drawer] latexFullText length:", latexFullText.length);

      const { latex: finalLatex, filename: extractedFilename } = splitMessage(latexFullText);

      if (!finalLatex) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, pdfState: "error" as PdfState, pdfError: "No LaTeX found in response. Try asking again." }
              : m,
          ),
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, pdfState: "compiling" as PdfState, pdfFilename: extractedFilename } : m),
      );
      
      try {
        const compiled = await compileLatexToPdf({ data: { latex: finalLatex } });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, pdfState: "ready" as PdfState, precompiledPdf: compiled.pdf, pdfFilename: extractedFilename }
              : m,
          ),
        );
      } catch (compileErr: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, pdfState: "error" as PdfState, pdfError: compileErr.message || "PDF compilation failed.", pdfFilename: extractedFilename }
              : m,
          ),
        );
      }
    } catch (err: any) {
      // AbortError means the user hit Stop — silently restore history
      if (err?.name === "AbortError" || controller.signal.aborted) {
        setMessages(history);
        return;
      }
      toast.error(err.message || "AI failed to respond");
      console.error(err);
      setMessages((prev) => prev.slice(0, -2));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleSend(textToSend: string) {
    void sendWithHistory(textToSend, messages);
  }

  function handleRetry(msgId: string) {
    if (loading) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const msg = messages[idx];

    if (msg.role === "user") {
      // Re-send this user message with everything before it as history
      void sendWithHistory(msg.content, messages.slice(0, idx));
    } else {
      // Find the preceding user message and re-send it
      let userIdx = idx - 1;
      while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
      if (userIdx < 0) return;
      void sendWithHistory(messages[userIdx].content, messages.slice(0, userIdx));
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        style={{
          width: isMobile ? undefined : `${width}px`,
          maxWidth: isMobile ? undefined : "100vw",
          transition: isResizing ? "none" : undefined,
        }}
        className={cn(
          "w-[90vw] p-0 flex flex-col h-full bg-background/95 backdrop-blur border-l shadow-2xl",
          isResizing && "select-none"
        )}
      >
        {!isMobile && (
          <div
            onMouseDown={startResize}
            className={cn(
              "absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50 flex items-center justify-center",
              isResizing && "bg-primary/20"
            )}
          >
            <div className="w-1 h-8 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/60 transition-colors" />
          </div>
        )}
        <div className="p-6 border-b flex items-center justify-between gap-4">
          <SheetHeader className="space-y-1 flex-1">
            <SheetTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              CRAS AI Assistant
            </SheetTitle>
            <SheetDescription>
              Real-time analytics and funnel recommendations
            </SheetDescription>
          </SheetHeader>
          {messages.length > 1 && (
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setMessages([
                    {
                      id: "intro",
                      role: "assistant",
                      content:
                        "Hi! I'm your CRAS AI Assistant. I can analyze your live CRM dataset, identify stalled deals, recommend channels, and summarize team wins. Ask me anything!",
                    },
                  ]);
                  localStorage.removeItem("ai-drawer-chat-history");
                }}
                className="text-muted-foreground hover:text-destructive cursor-pointer"
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-hidden relative min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
            <div className="space-y-4 pb-6">
              {messages.map((m) => {
                const { visible, latex, filename } = m.role === "assistant" ? splitMessage(m.content) : { visible: m.content, latex: null, filename: "report" };
                return (
                <Fragment key={m.id}>
                <div
                  className={`flex gap-3 ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  {(!m.pdfState || m.content) && (
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none border border-border"
                    }`}
                  >
                    {m.content ? (
                      <Markdown content={visible || (latex ? "Here's your report! Click below to preview or download." : "")} />
                    ) : m.pdfState ? null : (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                      </span>
                    )}
                  </div>
                  )}
                  {m.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 border">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
                {/* Collapsible thinking/reasoning block */}
                {m.role === "assistant" && m.thinking && (
                  <div className="flex justify-start ml-11">
                    <div className="max-w-[85%] w-full">
                      <button
                        onClick={() => setExpandedThinking((prev) => {
                          const next = new Set(prev);
                          next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                          return next;
                        })}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
                      >
                        <Brain className="h-3 w-3 text-primary/60" />
                        <span>Reasoning</span>
                        {expandedThinking.has(m.id)
                          ? <ChevronDown className="h-3 w-3" />
                          : <ChevronRight className="h-3 w-3" />}
                      </button>
                      {expandedThinking.has(m.id) && (
                        <ReasoningScrollArea text={m.thinking} />
                      )}
                    </div>
                  </div>
                )}
                {/* PDF process card — shown when pdfState is set OR latex is in content */}
                {m.role === "assistant" && (m.pdfState || latex) && (
                  <div className="ml-11">
                    <PdfProcessCard
                      pdfState={m.pdfState ?? "ready"}
                      pdfError={m.pdfError}
                      latex={latex}
                      filename={m.pdfFilename ?? filename ?? "report"}
                      precompiledPdf={m.precompiledPdf}
                      align="start"
                    />
                  </div>
                )}
                {m.role === "assistant" && (m.content || m.pdfState) && (
                  <div className={`flex gap-1 mt-1 justify-start`}>
                    <button
                      onClick={() => copyMessage(visible || "PDF report generated.")}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Copy message"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {!loading && (
                      <RegenerateButton onClick={() => handleRetry(m.id)} />
                    )}
                  </div>
                )}
                {m.role === "user" && m.content && (
                  <div className="flex gap-1 mt-1 justify-end">
                    {!loading && (
                      <button
                        onClick={() => handleRetry(m.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="Resend message"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
                </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Suggestions / Prompt helpers */}
        {messages.length === 1 && (
          <div className="px-6 py-4 border-t bg-muted/30 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Quick Questions
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={loading || analyticsLoading || !analytics}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-background hover:bg-primary/5 hover:text-primary border hover:border-primary/20 transition-all cursor-pointer font-medium truncate disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input box */}
        <div className="p-4 border-t bg-background space-y-2">
          {/* Thinking level controls */}
          <div className="flex items-center gap-2">
            {/* Thinking level selector */}
            <div className="flex items-center gap-1">
              <Brain className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground mr-1">Thinking:</span>
              {(["off", "auto", "on"] as ThinkingLevel[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setThinking(level)}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer",
                    thinking === level
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {level === "off" ? "Off" : level === "auto" ? "Auto" : "On"}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
                {thinking === "on" && "· 4k token budget, thorough"}
                {thinking === "off" && "· no reasoning, fastest"}
                {thinking === "auto" && "· 1k token budget, balanced"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(input);
                }
              }}
              placeholder={
                analyticsLoading
                  ? "Loading CRM data..."
                  : "Ask about channels, close/conversion rate, stale clients..."
              }
              disabled={loading || analyticsLoading || !analytics}
              rows={2}
              className="resize-none rounded-xl"
            />
            <Button
              onClick={loading ? stopGeneration : () => handleSend(input)}
              disabled={loading ? false : (!input.trim() || !analytics)}
              className={`self-end rounded-xl h-10 w-10 shrink-0 ${loading ? "bg-destructive hover:bg-destructive/90" : ""}`}
              size="icon"
            >
              {loading ? (
                <Square className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>

          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}