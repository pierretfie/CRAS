import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Send, Download, FileDown, Bot, User, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

export const Route = createFileRoute("/_authenticated/analytics/report")({
  component: ReportPage,
});

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function ReportPage() {
  const { data: analytics } = useAnalyticsData();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "Hi — I'm your CRAS analyst. I can answer questions about your funnel, channels, categories, top performers, or stale clients. Say **\"give me a report\"** for a full written summary, then download it as PDF.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!input.trim() || streaming || !analytics) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    const aMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages((m) => [...m, userMsg, aMsg]);
    setInput("");
    setStreaming(true);

    try {
      const { aiChatComplete } = await import("@/lib/api/ai.functions");
      const analyticsContext = `Total clients: ${analytics.total}\nConversion rate: ${(analytics.conversion * 100).toFixed(1)}%\nActive: ${analytics.active}, Won: ${analytics.won}, Lost: ${analytics.lost}\nStale clients (30+ days no activity): ${analytics.stale}\nTop channels: ${Object.entries(analytics.byMode).map(([k, v]) => `${k}: ${v}`).join(", ")}\nCategories: ${Object.entries(analytics.byCategory).map(([k, v]) => `${k}: ${v}`).join(", ")}\nBest converting category: ${analytics.bestCategory ?? "n/a"}\nTop performers: ${analytics.topUsers.map((u) => `${u.name}: ${u.wins} wins`).join(", ") || "none yet"}`;
      
      const result = await aiChatComplete({
        data: {
          messages: [...messages, userMsg].filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content })),
          analyticsContext,
        },
      });

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: result.content };
        return copy;
      });
    } catch (e: any) {
      toast.error(e.message || "AI error");
      console.error(e);
      // Remove the empty assistant bubble on failure
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  function downloadPDF() {
    if (!analytics) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    let y = margin;
    const pageH = doc.internal.pageSize.getHeight();
    const pageW = doc.internal.pageSize.getWidth();

    const writeLine = (text: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number] }) => {
      const size = opts?.size ?? 11;
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      doc.setFontSize(size);
      const color = opts?.color ?? [30, 30, 30];
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, pageW - margin * 2);
      for (const line of lines) {
        if (y > pageH - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += size * 1.35;
      }
    };

    writeLine("CRAS Conversion Report", { size: 22, bold: true, color: [200, 30, 30] });
    writeLine(new Date().toLocaleString(), { size: 9, color: [120, 120, 120] });
    y += 10;

    writeLine("Overview", { size: 14, bold: true });
    writeLine(`Total clients: ${analytics.total}`);
    writeLine(`Conversion rate: ${(analytics.conversion * 100).toFixed(1)}%`);
    writeLine(`Active / Won / Lost: ${analytics.active} / ${analytics.won} / ${analytics.lost}`);
    writeLine(`Stale clients: ${analytics.stale}`);
    y += 10;

    writeLine("Mode of Connection", { size: 14, bold: true });
    for (const [k, v] of Object.entries(analytics.byMode)) writeLine(`  - ${k}: ${v}`);
    y += 6;

    writeLine("Categories", { size: 14, bold: true });
    for (const [k, v] of Object.entries(analytics.byCategory)) writeLine(`  - ${k}: ${v}`);
    y += 6;

    writeLine("Top Performers", { size: 14, bold: true });
    if (analytics.topUsers.length === 0) writeLine("  (none yet)");
    for (const u of analytics.topUsers) writeLine(`  - ${u.name}: ${u.wins} wins`);
    y += 10;

    writeLine("Assistant Conversation", { size: 14, bold: true });
    for (const m of messages) {
      writeLine(`[${m.role.toUpperCase()}]`, { size: 10, bold: true, color: m.role === "user" ? [80, 80, 80] : [200, 30, 30] });
      writeLine(m.content.replace(/\*\*/g, ""));
      y += 4;
    }

    doc.save(`cras-report-${Date.now()}.pdf`);
    toast.success("Report downloaded");
  }

  function downloadLatex() {
    if (!analytics) return;
    const esc = (s: string) =>
      s.replace(/[&%$#_{}~^\\]/g, (c) =>
        ({ "&": "\\&", "%": "\\%", "$": "\\$", "#": "\\#", _: "\\_", "{": "\\{", "}": "\\}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}", "\\": "\\textbackslash{}" }[c] ?? c)
      );

    const lines: string[] = [
      "\\documentclass[12pt,a4paper]{article}",
      "\\usepackage[utf8]{inputenc}",
      "\\usepackage[T1]{fontenc}",
      "\\usepackage{geometry}",
      "\\geometry{margin=2.5cm}",
      "\\usepackage{booktabs}",
      "\\usepackage{xcolor}",
      "\\definecolor{crasred}{RGB}{200,30,30}",
      "\\usepackage{hyperref}",
      "",
      "\\title{\\textcolor{crasred}{CRAS Conversion Report}}",
      `\\date{${esc(new Date().toLocaleString())}}`,
      "\\author{CRAS Analytics System}",
      "",
      "\\begin{document}",
      "\\maketitle",
      "",
      "\\section*{Overview}",
      `\\textbf{Total clients:} ${analytics.total} \\\\`,
      `\\textbf{Conversion rate:} ${(analytics.conversion * 100).toFixed(1)}\\% \\\\`,
      `\\textbf{Active / Won / Lost:} ${analytics.active} / ${analytics.won} / ${analytics.lost} \\\\`,
      `\\textbf{Stale clients (30+ days):} ${analytics.stale} \\\\`,
      "",
      "\\section*{Mode of Connection}",
      "\\begin{itemize}",
      ...Object.entries(analytics.byMode).map(([k, v]) => `  \\item \\textbf{${esc(k)}:} ${v}`),
      "\\end{itemize}",
      "",
      "\\section*{Categories}",
      "\\begin{itemize}",
      ...Object.entries(analytics.byCategory).map(([k, v]) => `  \\item \\textbf{${esc(k)}:} ${v}`),
      "\\end{itemize}",
      "",
      "\\section*{Top Performers}",
      analytics.topUsers.length === 0
        ? "No conversions yet."
        : [
            "\\begin{tabular}{ll}",
            "\\toprule",
            "Name & Wins \\\\\\\\",
            "\\midrule",
            ...analytics.topUsers.map((u) => `${esc(u.name)} & ${u.wins} \\\\`),
            "\\bottomrule",
            "\\end{tabular}",
          ].join("\n"),
      "",
      "\\section*{AI Analyst Conversation}",
      ...messages.flatMap((m) => [
        `\\subsection*{${m.role === "user" ? "User" : "Assistant"}}`,
        esc(m.content.replace(/\*\*/g, "")),
        "",
      ]),
      "\\end{document}",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/x-tex" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cras-report-${Date.now()}.tex`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("LaTeX file downloaded");
  }

  function viewPDF() {
    if (!analytics) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    // reuse logic via downloadPDF? simpler: open blob
    // Inline minimal copy:
    doc.setFontSize(20); doc.setTextColor(200, 30, 30); doc.text("CRAS Conversion Report", 40, 50);
    doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text(new Date().toLocaleString(), 40, 65);
    doc.setTextColor(30, 30, 30); doc.setFontSize(11);
    let y = 100;
    const writeLine = (t: string) => { doc.text(t, 40, y); y += 16; };
    writeLine(`Total clients: ${analytics.total}`);
    writeLine(`Conversion rate: ${(analytics.conversion * 100).toFixed(1)}%`);
    writeLine(`Stale: ${analytics.stale}`);
    y += 10; doc.setFont("helvetica", "bold"); writeLine("Assistant said:"); doc.setFont("helvetica", "normal");
    for (const m of messages.filter((x) => x.role === "assistant").slice(-2)) {
      const lines = doc.splitTextToSize(m.content.replace(/\*\*/g, ""), 515);
      for (const l of lines) writeLine(l);
    }
    const blob = doc.output("bloburl");
    window.open(String(blob), "_blank");
  }

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Report Assistant</h1>
          <p className="text-sm text-muted-foreground">Chat with the CRAS analyst about your data</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setMessages([
              {
                id: "intro",
                role: "assistant",
                content:
                  "Hi — I'm your CRAS analyst. I can answer questions about your funnel, channels, categories, top performers, or stale clients. Say **\"give me a report\"** for a full written summary, then download it as PDF.",
              },
            ])} className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer">
              <Trash2 className="h-4 w-4 mr-1" />Clear Chat
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={downloadLatex}><FileText className="h-4 w-4 mr-1" />Download .tex</Button>
          <Button variant="outline" size="sm" onClick={viewPDF}><FileDown className="h-4 w-4 mr-1" />View PDF</Button>
          <Button size="sm" onClick={downloadPDF}><Download className="h-4 w-4 mr-1" />Download PDF</Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base">Conversation</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.content ? (
                    <Markdown content={m.content} />
                  ) : (
                    streaming ? "…" : ""
                  )}
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="border-t p-3 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder='Ask "give me a report", "best channel?", "stale clients?"…'
              rows={2}
              className="resize-none"
            />
            <Button onClick={send} disabled={streaming || !input.trim()} className="self-end">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
