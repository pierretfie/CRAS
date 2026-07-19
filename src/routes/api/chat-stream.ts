/**
 * SSE streaming endpoint for the AI chat assistant.
 * POST /api/chat-stream
 *
 * Body: { messages: [{role, content}], analyticsContext: string, thinking?: "off"|"auto"|"on" }
 *
 * Response: text/event-stream
 * Events:
 *   {"type":"chunk","text":"..."}        — incremental answer token
 *   {"type":"think_chunk","text":"..."}  — incremental thinking/reasoning token
 *   {"type":"latex_detected"}            — LaTeX marker found; switch to PDF pipeline
 *   {"type":"done"}                      — clean finish, no LaTeX
 *   {"type":"error","message":"..."}     — fatal error
 */
import { createFileRoute } from "@tanstack/react-router";
import type { ThinkingLevel } from "@/lib/ai-nvidia.server";
export const Route = createFileRoute("/api/chat-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          messages: { role: "user" | "assistant"; content: string }[];
          analyticsContext: string;
          thinking?: ThinkingLevel;
        };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { messages, analyticsContext, thinking = "auto" } = body;

        // Detect if this is a PDF/report request — only send the heavy LaTeX
        // instructions when actually needed (saves ~1,400 input tokens otherwise)
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";
        const isPdfRequest = /\b(pdf|report|document|generate|export|latex|formal|summary report|executive|overview report|breakdown report)\b/.test(lastUserMsg);

        const { isAIAvailable, aiStream, MODEL } = await import(
          "@/lib/ai-nvidia.server"
        );

        if (!isAIAvailable()) {
          return new Response(
            JSON.stringify({ error: "NVIDIA_API_KEY is not configured." }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }

        const systemPrompt = buildSystemPrompt(analyticsContext, isPdfRequest);

        const chatMessages: {
          role: "system" | "user" | "assistant";
          content: string;
        }[] = [
          { role: "system", content: systemPrompt },
          ...messages
            .filter((m) => m.content.trim() !== "")
            .map((m) => ({
              role: m.role as "system" | "user" | "assistant",
              content: m.content,
            })),
        ];

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            function send(obj: Record<string, unknown>) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
              );
            }

            try {
              let accumulated = "";
              const LATEX_MARKER = "%%LATEX_START%%";
              const FILENAME_MARKER_START = "%%FILENAME%%";
              let thinkCount = 0;
              let textCount = 0;
              let latexDetected = false;
              // Buffer to hold text that might be part of a marker (e.g. partial "%%FILENAME%%")
              // Only flush up to the last safe position before any %% sequence
              let pendingFlush = "";

              for await (const chunk of aiStream(chatMessages, thinking)) {
                if (chunk.type === "think") {
                  thinkCount++;
                  send({ type: "think_chunk", text: chunk.text });
                  continue;
                }

                // Answer token
                textCount++;
                accumulated += chunk.text;

                if (!latexDetected) {
                  if (accumulated.includes(LATEX_MARKER)) {
                    // Flush nothing — send the clean visible part via latex_detected
                    let visiblePart = accumulated.split(LATEX_MARKER)[0];
                    // Strip %%FILENAME%%...%% and any surrounding whitespace/newlines
                    visiblePart = visiblePart.replace(/%%FILENAME%%[^%]*%%/g, "").trim();
                    send({ type: "latex_detected", visibleText: visiblePart });
                    latexDetected = true;
                  } else {
                    // Hold back anything from the last %% onwards (could be start of a marker)
                    // Safe to flush everything before the last %%
                    pendingFlush += chunk.text;
                    const lastMarkerStart = pendingFlush.lastIndexOf("%%");
                    if (lastMarkerStart > 0) {
                      const safe = pendingFlush.slice(0, lastMarkerStart);
                      pendingFlush = pendingFlush.slice(lastMarkerStart);
                      if (safe) send({ type: "chunk", text: safe });
                    } else if (lastMarkerStart === -1) {
                      // No %% at all — flush everything
                      send({ type: "chunk", text: pendingFlush });
                      pendingFlush = "";
                    }
                    // If lastMarkerStart === 0, the whole pendingFlush starts with %% — hold it
                  }
                }
                // After latex_detected: silently accumulate, don't send chunks
              }

              // Flush any remaining pending text (only if no latex — means marker never completed)
              if (!latexDetected && pendingFlush) {
                // Strip any incomplete/leftover marker artifacts
                const clean = pendingFlush.replace(/%%[^%]*%%?/g, "").trim();
                if (clean) send({ type: "chunk", text: clean });
              }

              console.log(`[chat-stream] model=${MODEL} thinking=${thinking} think_chunks=${thinkCount} text_chunks=${textCount} latex=${latexDetected}`);

              if (latexDetected) {
                // Check if the response was truncated (no %%LATEX_END%% marker)
                const endMarker = "%%LATEX_END%%";
                if (!accumulated.includes(endMarker)) {
                  console.error("[chat-stream] Response truncated — %%LATEX_END%% missing. accumulated length:", accumulated.length);
                  send({ type: "error", message: "The AI response was cut off before the document finished generating. Please try again, or ask for a shorter/simpler report." });
                  return;
                }

                // Send the full accumulated text (visible + latex) so client can extract it
                send({ type: "latex_complete", fullText: accumulated });

                // Extract and send any text that appears after %%LATEX_END%%
                const endIdx = accumulated.indexOf(endMarker);
                if (endIdx !== -1) {
                  const afterLatex = accumulated.slice(endIdx + endMarker.length).trim();
                  if (afterLatex) {
                    send({ type: "post_latex_text", text: afterLatex });
                  }
                }
              }
              send({ type: "done" });
            } catch (err: any) {
              send({ type: "error", message: err?.message ?? "Stream error" });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});

function buildSystemPrompt(analyticsContext: string, isPdfRequest = false): string {
  const base = `You are a CRAS (Conversion Rate Analytics System) AI assistant. Live analytics data:

${analyticsContext}

RULES — DATA ONLY: Every number/fact MUST come from the analytics context above. Never invent, estimate, or assume figures. If data is absent say "I don't have that data." Never contradict a section that says "None" or "No wins recorded yet."

CONVERSATION: Be warm, direct, conversational — like a knowledgeable colleague, not a bot. No option lists (A/B/C), no unsolicited stat dumps. Greet briefly. Use clean markdown for data answers.

FOLLOW-UPS: Prioritise by: 1) OVERDUE 2) interest ≥7 3) stage/notes 4) frequency. Always name the client, interest level, and what specifically to say.

DATA KEY: Stale=14+ days inactive. Interest: ≥9 High-Priority, ≥7 Committed, ≥5 Engaged, ≥3 Exploring, <3 Unqualified. Stage 1=lead, 2=engaged, 3=near-close. Won=converted, Lost=fell through.`;

  if (!isPdfRequest) return base;

  return `${base}

PDF GENERATION: When asked for a PDF/report/document, output a brief friendly message then the LaTeX wrapped in markers — NEVER show raw LaTeX to the user:
%%FILENAME%%descriptive-slug%%
%%LATEX_START%%
\\documentclass...
\\end{document}
%%LATEX_END%%

FILENAME: lowercase-hyphenated, under 5 words, describes the content. E.g. channel-performance-analysis, stale-clients-followup, team-performance-summary.

AUTHORSHIP: Use the REPORT AUTHOR name from the analytics context on the title page. NEVER write "AI", "CRAS AI Assistant", or any AI reference.

TOKEN BUDGET — CRITICAL to avoid truncation:
- Sections: 2–4 sentences max. Tables: max 8–10 rows (sample/aggregate if more).
- Always include \\tableofcontents followed by \\newpage — it makes the report look professional and allows the reader to navigate sections.
- No boilerplate intros — start with data.
- Summary: 3–5 bullets max.
- Entire LaTeX ≤ 600 lines.

LATEX RULES:
- Title page text on ONE LINE per brace pair: {\\Huge\\bfseries\\color{dark} Full Title Here\\par}
- Use \\par not \\\\ inside title blocks. Never split commands across lines.
- No Markdown in LaTeX: use \\textbf{}, \\textit{}, \\section{}, \\begin{itemize}\\item
- No Unicode: ≥→$\\geq$, ≤→$\\leq$, →→$\\rightarrow$, —→---, •→\\textbullet{}, ×→$\\times$
- Escape in text: &→\\&, %→\\%, $→\\$, #→\\#, _→\\_
- Bare & only inside tabular as column separator. Column count must match EVERY row.

EXACT PREAMBLE (use for every report):
\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{xcolor,titlesec,fancyhdr,booktabs,tabularx,graphicx,enumitem,hyperref,parskip,colortbl}
\\definecolor{primary}{HTML}{2563EB}
\\definecolor{dark}{HTML}{1E293B}
\\definecolor{success}{HTML}{059669}
\\definecolor{warning}{HTML}{D97706}
\\definecolor{lightgray}{HTML}{F1F5F9}
\\titleformat{\\section}{\\Large\\bfseries\\color{primary}}{}{0em}{}[\\titlerule]
\\titleformat{\\subsection}{\\large\\bfseries\\color{dark}}{}{0em}{}
\\pagestyle{fancy}\\fancyhf{}
\\fancyhead[L]{\\small\\color{gray}CRAS Report}\\fancyhead[R]{\\small\\color{gray}\\today}
\\fancyfoot[C]{\\small\\color{gray}\\thepage}\\renewcommand{\\headrulewidth}{0.4pt}
\\hypersetup{colorlinks=true,linkcolor=primary,urlcolor=primary}

TITLE PAGE structure:
\\begin{titlepage}\\centering\\vspace*{2cm}
{\\Huge\\bfseries\\color{dark} Report Title\\par}\\vspace{0.5cm}
{\\Large\\color{gray} Subtitle\\par}\\vspace{2cm}
{\\large\\color{dark} CRAS Analytics\\par}\\vspace{0.3cm}
{\\small\\color{gray}\\today\\par}\\vfill
{\\small\\color{gray}Prepared by [Author]}
\\end{titlepage}

CONTENT: booktabs tables (\\toprule/\\midrule/\\bottomrule), \\rowcolor{lightgray} alternating rows, \\textbf{metric:} value for key stats, \\newpage between major sections, Key Insights section at end.`;
}