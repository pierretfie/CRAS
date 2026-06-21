import { useEffect, useRef, useState } from "react";
import { useAIDrawer } from "@/hooks/use-ai-drawer";
import { cn } from "@/lib/utils";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { aiChatComplete } from "@/lib/api/ai.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, Sparkles, MessageSquare, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "Give me an executive report",
  "Which connection channel is best?",
  "Show stale clients needing attention",
  "What are our top service categories?",
];

export function AIAssistantDrawer() {
  const { isOpen, close } = useAIDrawer();
  const { data: analytics, isLoading: analyticsLoading } = useAnalyticsData();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "Hi! I'm your CRAS AI Assistant. I can analyze your live CRM dataset, identify stalled deals, recommend channels, and summarize team wins. Ask me anything!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || loading || !analytics) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantPlaceholder: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setInput("");
    setLoading(true);

    try {
      const analyticsContext = `Total clients: ${analytics.total}
Conversion rate: ${(analytics.conversion * 100).toFixed(1)}%
Active: ${analytics.active}, Won: ${analytics.won}, Lost: ${analytics.lost}
Stale clients (30+ days no activity): ${analytics.stale}
Top channels: ${Object.entries(analytics.byMode)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}
Categories: ${Object.entries(analytics.byCategory)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}
Best converting category: ${analytics.bestCategory ?? "n/a"}
Top performers: ${
        analytics.topUsers.map((u) => `${u.name}: ${u.wins} wins`).join(", ") ||
        "none yet"
      }`;

      const result = await aiChatComplete({
        data: {
          messages: [...messages, userMsg]
            .filter((m) => m.content !== "")
            .map((m) => ({ role: m.role, content: m.content })),
          analyticsContext,
        },
      });

      setMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0) {
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            content: result.content,
          };
        }
        return copy;
      });
    } catch (err: any) {
      toast.error(err.message || "AI failed to respond");
      console.error(err);
      // Remove placeholder bubble
      setMessages((prev) => prev.slice(0, -2));
    } finally {
      setLoading(false);
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setMessages([
                  {
                    id: "intro",
                    role: "assistant",
                    content:
                      "Hi! I'm your CRAS AI Assistant. I can analyze your live CRM dataset, identify stalled deals, recommend channels, and summarize team wins. Ask me anything!",
                  },
                ])
              }
              className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-hidden relative min-h-0 flex flex-col">
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-4 pb-6">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {m.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-muted text-foreground rounded-tl-none border border-border"
                    }`}
                  >
                    {m.content ? (
                      <Markdown content={m.content} />
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                      </span>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 border">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
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
        <div className="p-4 border-t bg-background">
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
                  : "Ask about channels, conversion rate, stale clients..."
              }
              disabled={loading || analyticsLoading || !analytics}
              rows={2}
              className="resize-none rounded-xl"
            />
            <Button
              onClick={() => handleSend(input)}
              disabled={loading || analyticsLoading || !input.trim() || !analytics}
              className="self-end rounded-xl h-10 w-10 shrink-0"
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
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
