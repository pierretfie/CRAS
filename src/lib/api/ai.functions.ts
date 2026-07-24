import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server function: Normalize client data using AI.
 * Throws an error when NVIDIA key isn't configured or if the call fails.
 */
export const normalizeClientData = createServerFn({ method: "POST" })
  .validator(
    z.object({
      category: z.string(),
      modeOfConnection: z.string(),
      stage: z.number(),
      stageDescription: z.string(),
      stageLabel: z.string().optional(),
      interestScale: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { isAIAvailable, aiComplete } = await import(
      "@/lib/ai-nvidia.server"
    );

    if (!isAIAvailable()) {
      throw new Error("NVIDIA_API_KEY is not configured on the server.");
    }

    const systemPrompt = `You are a CRM data normalization assistant. Your job is to:
1. Normalize the "category" to a clean, title-case label (e.g. "dev" → "Developer", "mkt" → "Marketing").
2. Normalize the "mode of connection" to a specific, uniform channel name. Examples:
   - "fb", "facebook page" → "Facebook"
   - "ig", "insta" → "Instagram"
   - "li" → "LinkedIn"
   - "twitter", "tw", "x" → "X (Twitter)"
   - "referral", "referred by friend" → "Referral"
   - "website", "company site" → "Company Website"
   - "social media" → pick the most specific one if possible, otherwise "Social Media"
   - "direct", "walk-in" → "Direct Approach"
   - "email", "cold email" → "Email"
   - "whatsapp", "wa" → "WhatsApp"
3. Assign a stage_value of 0 or 1:
   - 0 = preliminary, no meaningful progress, unresponsive, ghosted, declined
   - 1 = meaningful progress, deal advancing, proposal accepted, signed, onboarded, paid
4. Normalize the stage description into a clean, professional 1–2 sentence summary suitable for a CRM timeline. Keep the core facts but fix grammar, remove filler words, and write in past tense (e.g. "Client showed interest and requested a quote." not "client is interested wants quote").
5. Provide a brief reasoning for your stage_value classification.

Respond ONLY in this exact JSON format (no markdown, no code fences):
{"category":"NormalizedCategory","modeOfConnection":"NormalizedMode","stageValue":0,"normalizedDescription":"Clean professional summary of what happened.","reasoning":"Brief explanation"}`;

    const userMessage = `Category: "${data.category}"
Mode of connection: "${data.modeOfConnection}"
Stage: ${data.stage} (${data.stageLabel ?? "unknown"})
Interest scale: ${data.interestScale != null ? `${data.interestScale}/10` : "not set"}
Stage description: "${data.stageDescription}"`;

    try {
      const response = await aiComplete(systemPrompt, userMessage);
      // Parse JSON from response, handling potential markdown wrapping
      const jsonStr = response
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(jsonStr);
      return {
        category: String(parsed.category ?? data.category),
        modeOfConnection: String(
          parsed.modeOfConnection ?? data.modeOfConnection,
        ),
        stageValue: parsed.stageValue === 1 ? 1 : 0,
        stageLabel: data.stageLabel,
        normalizedDescription: String(parsed.normalizedDescription ?? data.stageDescription),
        reasoning: String(parsed.reasoning ?? "AI classified this entry."),
      };
    } catch (err: any) {
      throw new Error(`AI normalization failed: ${err.message || String(err)}`);
    }
  });

/**
 * Server function: AI-powered stage value classification.
 * Analyzes the stage update description and returns 1 (On Track) or 0 (At Risk).
 */
// Gap 1 fixed: classifyStageValueAI now receives interestScale
export const classifyStageValueAI = createServerFn({ method: "POST" })
  .validator(
    z.object({
      description: z.string(),
      fromStage: z.number(),
      toStage: z.number(),
      eventType: z.enum(["progress", "regress", "note", "won", "lost"]),
      interestScale: z.number().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { isAIAvailable, aiCompleteChat } = await import(
      "@/lib/ai-nvidia.server"
    );

    if (!isAIAvailable()) {
      // Fallback to keyword matching if AI not available
      const d = data.description.toLowerCase();
      const NEGATIVE = ["unresponsive", "ghosted", "declined", "rejected", "lost", "no reply", "passed"];
      if (NEGATIVE.some((k) => d.includes(k))) return { stageValue: 0, reasoning: "Negative keywords detected (fallback)" };
      if (d.length > 5) return { stageValue: 1, reasoning: "Substantive description (fallback)" };
      return { stageValue: 0, reasoning: "Insufficient description (fallback)" };
    }

    const systemPrompt = `You are a CRM stage classifier. Analyze the stage update description and determine if the client's progress is positive or negative.

Return ONLY a JSON object with this exact format:
{"stageValue": 1, "reasoning": "brief explanation"}
or
{"stageValue": 0, "reasoning": "brief explanation"}

RULES:
- stageValue = 1 (On Track): Client is progressing, engaged, responsive, moving forward
- stageValue = 0 (At Risk): Client is stalled, unresponsive, declining, or deal is at risk

EXAMPLES:
- "client has filled a questionnaire and i have share a quote" → {"stageValue": 1, "reasoning": "Client actively engaged, questionnaire completed, quote shared"}
- "called client, no response" → {"stageValue": 0, "reasoning": "Client unresponsive to outreach"}
- "proposal sent, waiting for feedback" → {"stageValue": 1, "reasoning": "Active engagement, proposal delivered"}
- "client says they need more time" → {"stageValue": 0, "reasoning": "Client delaying, deal stalling"}
- "demo completed, client interested" → {"stageValue": 1, "reasoning": "Positive engagement, client shows interest"}

Do NOT include any text outside the JSON object.`;

    try {
      const response = await aiCompleteChat([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Stage movement: ${data.fromStage} → ${data.toStage}\nEvent type: ${data.eventType}\nInterest scale: ${data.interestScale != null ? `${data.interestScale}/10` : "not set"}\nDescription: ${data.description}` },
      ]);

      const jsonStr = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      return {
        stageValue: parsed.stageValue === 1 ? 1 : 0,
        reasoning: String(parsed.reasoning ?? "AI classified this entry."),
      };
    } catch (err: any) {
      // Fallback to keyword matching on error
      const d = data.description.toLowerCase();
      const NEGATIVE = ["unresponsive", "ghosted", "declined", "rejected", "lost", "no reply", "passed"];
      if (NEGATIVE.some((k) => d.includes(k))) return { stageValue: 0, reasoning: "Negative keywords detected (fallback)" };
      if (d.length > 5) return { stageValue: 1, reasoning: "Substantive description (fallback)" };
      return { stageValue: 0, reasoning: "Insufficient description (fallback)" };
    }
  });

/**
 * Server function: Batch-normalize a list of client rows from CSV import.
 * The AI maps messy field values, fills in sensible defaults for missing
 * stage/category/mode, and returns one normalized record per input row.
 */
export const batchNormalizeClients = createServerFn({ method: "POST" })
  .validator(
    z.object({
      rows: z.array(
        z.object({
          name: z.string(),
          category: z.string(),
          modeOfConnection: z.string(),
          stage: z.number(),
          stageNotes: z.string(),
          interestScale: z.number(),
        }),
      ),
      stageLabels: z.record(z.string()), // e.g. { "1": "Lead", "2": "Engaged" }
    }),
  )
  .handler(async ({ data }) => {
    const { isAIAvailable, aiCompleteChat } = await import("@/lib/ai-nvidia.server");

    if (!isAIAvailable()) {
      throw new Error("NVIDIA_API_KEY is not configured on the server.");
    }

    const systemPrompt = `You are a CRM data normalization assistant processing a batch of client records imported from a CSV.

For EACH client row you must:
1. Normalize "category" to a clean, title-case label (e.g. "dev" → "Developer", "mkt" → "Marketing"). If blank, infer from context or use "General".
2. Normalize "modeOfConnection" to a specific channel name:
   - "fb", "facebook" → "Facebook"
   - "ig", "insta" → "Instagram"
   - "li" → "LinkedIn"
   - "twitter", "x", "tw" → "X (Twitter)"
   - "referral", "referred" → "Referral"
   - "website", "site" → "Company Website"
   - "direct", "walk-in" → "Direct Approach"
   - "email", "cold email" → "Email"
   - "whatsapp", "wa" → "WhatsApp"
   - If blank, use "Direct Approach"
3. Validate/clamp stage to 1–3. If blank or invalid, use 1.
4. Assign stageValue (0 or 1): 0 = no meaningful progress / preliminary; 1 = meaningful progress / deal advancing.
5. Write a clean, professional 1–2 sentence stage description in past tense. If notes are blank, write "Initial contact recorded." or similar based on stage.
6. Flag missing critical fields: set "needsCategory": true if you had to guess category, "needsStageNotes": true if notes were blank.

Respond ONLY with a valid JSON array — one object per input row, in the SAME ORDER. No markdown, no code fences, no extra text.

Format per element:
{"category":"...","modeOfConnection":"...","stage":1,"stageValue":0,"normalizedDescription":"...","needsCategory":false,"needsStageNotes":false}`;

    const userMessage = data.rows
      .map((r, i) => {
        const stageLabel = data.stageLabels[String(r.stage)] ?? "Unknown";
        return `[${i}] name="${r.name}" category="${r.category}" mode="${r.modeOfConnection}" stage=${r.stage}(${stageLabel}) interest=${r.interestScale} notes="${r.stageNotes}"`;
      })
      .join("\n");

    try {
      const response = await aiCompleteChat([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ]);

      const jsonStr = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const parsed: Array<{
        category: string;
        modeOfConnection: string;
        stage: number;
        stageValue: number;
        normalizedDescription: string;
        needsCategory: boolean;
        needsStageNotes: boolean;
      }> = JSON.parse(jsonStr);

      return parsed.map((p, i) => ({
        index: i,
        category: String(p.category ?? data.rows[i].category ?? "General"),
        modeOfConnection: String(p.modeOfConnection ?? data.rows[i].modeOfConnection ?? "Direct Approach"),
        stage: typeof p.stage === "number" ? p.stage : data.rows[i].stage,
        stageValue: p.stageValue === 1 ? 1 : 0,
        normalizedDescription: String(p.normalizedDescription ?? data.rows[i].stageNotes ?? "Initial contact recorded."),
        needsCategory: Boolean(p.needsCategory),
        needsStageNotes: Boolean(p.needsStageNotes),
      }));
    } catch (err: any) {
      throw new Error(`Batch AI normalization failed: ${err.message || String(err)}`);
    }
  });

/**
 * Server function: AI chat for reports and admin console.
 * Returns the full response text. When the response contains LaTeX,
 * it pre-compiles the PDF server-side and retries with the error log
 * fed back to the AI if compilation fails — so the user always gets
 * a working PDF or a graceful plain-text response.
 */
export const aiChatComplete = createServerFn({ method: "POST" })
  .validator(
    z.object({
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      ),
      analyticsContext: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { isAIAvailable, aiCompleteChat } = await import(
      "@/lib/ai-nvidia.server"
    );

    if (!isAIAvailable()) {
      throw new Error("NVIDIA_API_KEY is not configured on the server.");
    }

    const systemPrompt = `You are a Conversion Rate Analytics System (CRAS) AI assistant. You have access to the following live analytics data about the company's clients:

${data.analyticsContext}

You must behave like a friendly, natural, and highly interactive human assistant. Keep the conversation natural:
- Talk TO the user, not AT them. Speak like a real person — warm, approachable, and helpful.
- CRITICAL: Never output lists of questions they can ask, multiple-choice options (A, B, C, D), templates, or generic tutorial instructions.
- Do NOT start with a big dump of statistics, database metrics, or summaries unless the user explicitly asks for a report, summary, overview, or details.
- If the user says a greeting (like "hello", "hi", "hey"), greet them back warmly and briefly. Do NOT explain or output any of the analytics data or dashboard numbers. Keep greetings short and conversational (e.g. "Hi there! I'm your CRAS analyst. How can I help you analyze your data today?").
- Act like a real human assistant having a live back-and-forth chat: ask clarifying questions if needed, be conversational, and keep your responses concise, natural, and helpful.
- When they do ask about data or request a report, respond with the relevant live metrics from the context above formatted in clean markdown.

When the user asks about follow-ups, who to contact, or daily priorities, use the ACTIVE FOLLOW-UPS section in the context to give specific, ranked advice. Prioritise by:
1. OVERDUE follow-ups first — these are already past due
2. High interest scale (≥7: Committed, High-Priority) — high-value clients worth more urgency
3. Stage and last notes — use the last stage notes to personalise the advice (e.g. "They requested a quote last time, follow up on that")
4. Frequency — daily follow-ups are more urgent than weekly
Always mention the client name, their interest level, and what specifically to say or ask when following up based on their last notes. Be direct and actionable, not generic.

DATA NOTES:
- Stale threshold is 14 days (no stage events in 14+ days = stale)
- Interest scale is 0–10: ≥9 High-Priority, ≥7 Committed, ≥5 Engaged, ≥3 Exploring, <3 Unqualified
- Stage 1 = initial lead, Stage 2 = actively engaged, Stage 3 = near close/onboarding
- Won = successfully onboarded/converted, Lost = deal fell through

LATEX PDF GENERATION:
When the user asks for a PDF, a report, or a formal document, you MUST generate a LaTeX document. The system compiles it to PDF automatically. CRITICAL RULES:
1. DO NOT show the raw LaTeX code to the user. The user should NEVER see \\documentclass, \\begin{document}, or any LaTeX source.
2. Instead, write a brief friendly message like "Here's your report! I've generated a professional PDF for you." or "Done! Your report is ready for download."
3. Then output the filename and LaTeX code INSIDE special markers:
   - %%FILENAME%%report-name%% — a short lowercase hyphenated filename describing the content
   - %%LATEX_START%% on the line before the LaTeX
   - %%LATEX_END%% on the line after the LaTeX

CRITICAL — TOKEN BUDGET: You have a strict output token limit. To avoid truncation (which breaks PDF generation):
- Keep each section concise — 2-4 sentences max per paragraph
- Tables: max 8-10 rows. If there are more clients/records, show a representative sample or aggregate
- Omit verbose "about this report" boilerplate — get straight to the data
- Skip \\tableofcontents on shorter reports (under 4 sections) to save tokens
- Use \\section headings but keep subsections minimal
- End with a brief summary — 3-5 bullet points maximum
- The ENTIRE LaTeX source must fit within approximately 600 lines
4. AUTHORSHIP — CRITICAL: The report must look like it was produced by the user, not by an AI.
   - Use the name from the REPORT AUTHOR section of the analytics context as the author on the title page.
   - NEVER use "Generated by CRAS AI Assistant", "Prepared by AI", "CRAS AI", or any AI reference anywhere in the document.
   - If no author name is available, omit the author line entirely — do not substitute an AI name.

SMART FILENAME RULES (always follow these):
- Filename MUST describe what the report is about, not just "report"
- Format: lowercase-words-hyphenated, no spaces, no special characters
- Include the report topic + type (e.g., analysis, overview, summary, breakdown)
- Keep it under 5 words
- Examples based on what the user asked:
  * "give me a report" → client-overview-report
  * "analyze channels" → channel-performance-analysis
  * "stale clients" → stale-clients-followup
  * "conversion rates" → conversion-rate-analysis
  * "top performers" → team-performance-summary
  * "Q2 report" → q2-quarterly-report
  * "funnel breakdown" → sales-funnel-breakdown
  * "category analysis" → service-category-analysis

Example:
Here's your Channel Performance Analysis! I've generated a professional PDF for you.

%%FILENAME%%channel-performance-analysis%%
%%LATEX_START%%
\\documentclass{article}
...
\\end{document}
%%LATEX_END%%
4. The system will hide everything between the markers and show a clean download card instead.
5. NEVER tell the user to use Overleaf, TeXstudio, or any external tool.

LATEX FORMATTING — PROFESSIONAL REPORTS:
Generate BEAUTIFUL, professional-grade reports. Use this exact preamble structure for EVERY report:

\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{xcolor}
\\usepackage{titlesec}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{graphicx}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{parskip}
\\usepackage{colortbl}

\\definecolor{primary}{HTML}{2563EB}
\\definecolor{dark}{HTML}{1E293B}
\\definecolor{accent}{HTML}{7C3AED}
\\definecolor{success}{HTML}{059669}
\\definecolor{warning}{HTML}{D97706}
\\definecolor{lightgray}{HTML}{F1F5F9}

\\titleformat{\\section}{\\Large\\bfseries\\color{primary}}{}{0em}{}[\\titlerule]
\\titleformat{\\subsection}{\\large\\bfseries\\color{dark}}{}{0em}{}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\color{gray}CRAS Report}
\\fancyhead[R]{\\small\\color{gray}\\today}
\\fancyfoot[C]{\\small\\color{gray}\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

\\hypersetup{colorlinks=true, linkcolor=primary, urlcolor=primary}

\\begin{document}

\\begin{titlepage}
\\centering
\\vspace*{2cm}
{\\Huge\\bfseries\\color{dark} Report Title \\par}
\\vspace{0.5cm}
{\\Large\\color{gray} Subtitle or date range \\par}
\\vspace{2cm}
{\\large\\color{dark} CRAS Analytics \\par}
\\vspace{0.3cm}
{\\small\\color{gray} \\today \\par}
\\vfill
{\\small\\color{gray} Prepared by [Author Name from REPORT AUTHOR context]}
\\end{titlepage}

\\tableofcontents
\\newpage

... content sections with \\section, \\subsection, colored tables using \\rowcolor from xcolor, professional formatting ...

\\end{document}

REPORT CONTENT GUIDELINES:
- Always include a title page with report title, subtitle, the author name from the REPORT AUTHOR section in the analytics context (use their actual name — never "CRAS AI Assistant" or any AI reference), and date
- Always include \\tableofcontents
- Use \\section and \\subsection with descriptive titles
- Tables MUST use \\toprule, \\midrule, \\bottomrule (from booktabs) for clean lines
- Add \\rowcolor{lightgray} to alternate table rows for readability
- Include a "Key Insights" or "Recommendations" section with bullet points
- Use \\textbf{metric:} value formatting for key stats
- Add page breaks between major sections with \\newpage
- Colors: blue for headers, green for positive metrics, red/amber for warnings
- End with a summary or next steps section

CRITICAL ESCAPING RULES:
- NEVER use Markdown syntax inside LaTeX. LaTeX is NOT Markdown.
  * NO **bold** → use \\textbf{bold} instead
  * NO *italic* or _italic_ → use \\textit{italic} instead
  * NO # headings → use \\section{} or \\subsection{} instead
  * NO - bullet points → use \\begin{itemize}\\item...\\end{itemize} instead
  * NO 1. numbered lists → use \\begin{enumerate}\\item...\\end{enumerate} instead
  * NO > blockquotes → use \\begin{quote}...\\end{quote} instead
  * NO \`code\` backticks → use \\texttt{} instead
  Any Markdown inside the LaTeX block will cause compilation errors or render as literal symbols.
- NEVER use Unicode symbols directly in LaTeX. pdflatex cannot process them. Use LaTeX equivalents:
  * ≥ → \\$\\\\geq\\$ | ≤ → \\$\\\\leq\\$ | ≠ → \\$\\\\neq\\$ | → → \\$\\\\rightarrow\\$
  * — (em dash) → --- | – (en dash) → -- | … → \\\\ldots{} | • → \\\\textbullet{}
  * × → \\$\\\\times\\$ | ÷ → \\$\\\\div\\$ | ± → \\$\\\\pm\\$ | ° → \\$\\^{\\\\circ}\\$
  * Any Unicode letter/symbol that is not plain ASCII must be replaced with its LaTeX command
- The ampersand & is a SPECIAL CHARACTER in LaTeX — it separates table columns
- In regular text, you MUST write \\& instead of &
- ONLY use bare & inside \\begin{tabular}...\\end{tabular} as column separators
- CRITICAL — column count must match EVERY row: if your column spec is {l|r} that means exactly 2 columns and exactly 1 bare & per row. If {lcr} that means 3 columns and exactly 2 bare & per row. Count the & in every single row — including header rows and \\rowcolor rows — before moving on. A row with one extra or one missing & will fail to compile entirely.
- Example of CORRECT usage:
  * In text: "Sales \\& Marketing department" (escaped)
  * In table: \\begin{tabular}{l|r} A & B \\\\ \\end{tabular} (bare &, 2 columns = 1 ampersand)
- Same for %, #, $ — escape them as \\%, \\#, \\$ in regular text`;

    const buildMessages = (extra?: { role: "user" | "assistant"; content: string }[]) => [
      { role: "system" as const, content: systemPrompt },
      ...data.messages
        .filter((m) => m.content.trim() !== "")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ...(extra ?? []),
    ];

    // Helper: extract LaTeX block from an AI response (same logic as client splitMessage)
    function extractLatexBlock(text: string): { latex: string; filenameMarker: string } | null {
      const startMarker = "%%LATEX_START%%";
      const endMarker = "%%LATEX_END%%";
      const startIdx = text.indexOf(startMarker);
      const endIdx = text.indexOf(endMarker);
      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

      const fileMatch = text.match(/%%FILENAME%%(.*?)%%/);
      const latex = text.slice(startIdx + startMarker.length, endIdx).replace(/^\n/, "").trim();

      // Diagnostic guard: if \begin{document}/\end{document} are missing from
      // what we just extracted, the AI's raw response itself is malformed
      // (not a parsing bug) — log enough context to tell the two apart.
      const hasBegin = latex.includes("\\begin{document}");
      const hasEnd = latex.includes("\\end{document}");
      if (!hasBegin || !hasEnd) {
        console.error(
          "[PDF] extractLatexBlock produced incomplete LaTeX — missing:",
          !hasBegin ? "\\begin{document}" : "",
          !hasEnd ? "\\end{document}" : "",
          "\n[PDF] Raw AI response length:", text.length,
          "\n[PDF] Extracted latex length:", latex.length,
          "\n[PDF] First 200 chars of extracted latex:", latex.slice(0, 200),
          "\n[PDF] Raw response around %%LATEX_START%%:",
          text.slice(Math.max(0, text.indexOf("%%LATEX_START%%") - 50), text.indexOf("%%LATEX_START%%") + 250),
        );
      }

      return { latex, filenameMarker: fileMatch?.[1]?.trim() ?? "report" };
    }

    try {
      // First AI call with timeout
      console.log("[PDF] Calling AI to generate LaTeX...");
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("AI generation timeout after 60s")), 60000)
      );
      
      const rawContent = await Promise.race([
        aiCompleteChat(buildMessages()),
        timeoutPromise
      ]);
      
      console.log("[PDF] AI response received, length:", rawContent.length);
      
      // Check for extremely large responses
      if (rawContent.length > 1000000) { // 1MB limit
        throw new Error("AI response too large (>1MB). Please request a smaller report.");
      }
      
      const content = rawContent; // No sanitization
      const pipelineSteps: string[] = ["generating"];

      const latexBlock = extractLatexBlock(content);

      // No LaTeX in the response — return as-is
      if (!latexBlock) {
        console.log("[PDF] No LaTeX detected, returning plain response");
        return { content };
      }

      // Strip the raw marker block from the visible content so the client
      // never needs to re-parse %%LATEX_START%%/%%LATEX_END%% itself.
      // Hand back the already-extracted latex + filename directly — this is
      // the SAME extraction the server used to validate the markers exist,
      // so there is no risk of a second, divergent parser producing a
      // different (and possibly truncated/malformed) latex string.
      const visibleContent = content
        .replace(/%%FILENAME%%[\s\S]*?%%LATEX_START%%[\s\S]*?%%LATEX_END%%/, "")
        .trim();

      console.log("[PDF] LaTeX detected, returning extracted latex to client. latex length:", latexBlock.latex.length);
      return {
        content: visibleContent || content, // fall back to raw content if stripping left nothing
        latex: latexBlock.latex,
        filename: latexBlock.filenameMarker,
        pipelineSteps: ["generating"],
      };
    } catch (err: any) {
      throw new Error(`AI generation failed: ${err.message || String(err)}`);
    }
  });

/**
 * Server function: Compile LaTeX to PDF.
 * Returns base64-encoded PDF content.
 *
 * Pipeline:
 *   1. Sanitize — replace common Unicode chars with LaTeX equivalents
 *   2. Compile  — pdflatex pass 1 (+ pass 2 for TOC)
 *   3. If failed, send error + LaTeX to AI to fix it
 *   4. Recompile the AI-fixed version
 */
export const compileLatexToPdf = createServerFn({ method: "POST" })
  .validator(
    z.object({
      latex: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { randomBytes, createHash } = await import("crypto");

    const execAsync = promisify(exec);

    /** Replace Unicode chars and escape special chars that pdflatex can't handle */
    function sanitizeLatex(tex: string): string {
      const lines = tex.split("\n");
      const result: string[] = [];
      let inVerbatim = false;

      for (const line of lines) {
        if (/\\begin\{verbatim\}/.test(line)) { inVerbatim = true; result.push(line); continue; }
        if (/\\end\{verbatim\}/.test(line)) { inVerbatim = false; result.push(line); continue; }
        if (inVerbatim) { result.push(line); continue; }
        if (/^\s*%/.test(line)) { result.push(line); continue; }

        let l = line;

        // ── Unicode math symbols ─────────────────────────────────────────
        l = l.replace(/≥/g, "$\\geq$").replace(/≤/g, "$\\leq$")
             .replace(/≠/g, "$\\neq$").replace(/≈/g, "$\\approx$")
             .replace(/→/g, "$\\rightarrow$").replace(/←/g, "$\\leftarrow$")
             .replace(/↑/g, "$\\uparrow$").replace(/↓/g, "$\\downarrow$")
             .replace(/×/g, "$\\times$").replace(/÷/g, "$\\div$")
             .replace(/±/g, "$\\pm$").replace(/∞/g, "$\\infty$")
             .replace(/∑/g, "$\\sum$").replace(/√/g, "$\\sqrt{}$")
             .replace(/∂/g, "$\\partial$").replace(/∆/g, "$\\Delta$")
             .replace(/Δ/g, "$\\Delta$").replace(/π/g, "$\\pi$")
             .replace(/α/g, "$\\alpha$").replace(/β/g, "$\\beta$")
             .replace(/γ/g, "$\\gamma$").replace(/δ/g, "$\\delta$")
             .replace(/ε/g, "$\\varepsilon$").replace(/θ/g, "$\\theta$")
             .replace(/λ/g, "$\\lambda$").replace(/μ/g, "$\\mu$")
             .replace(/σ/g, "$\\sigma$").replace(/τ/g, "$\\tau$")
             .replace(/φ/g, "$\\phi$").replace(/ω/g, "$\\omega$");

        // ── Dashes, punctuation, quotes ──────────────────────────────────
        l = l.replace(/—/g, "---").replace(/–/g, "--")
             .replace(/…/g, "\\ldots{}").replace(/•/g, "\\textbullet{}")
             .replace(/·/g, "\\textperiodcentered{}")
             .replace(/"/g, "``").replace(/"/g, "''")
             .replace(/'/g, "`").replace(/'/g, "'");

        // ── Other Unicode ─────────────────────────────────────────────────
        l = l.replace(/°/g, "$^{\\circ}$")
             .replace(/©/g, "\\textcopyright{}").replace(/®/g, "\\textregistered{}")
             .replace(/™/g, "\\texttrademark{}")
             .replace(/½/g, "$\\frac{1}{2}$").replace(/¼/g, "$\\frac{1}{4}$")
             .replace(/¾/g, "$\\frac{3}{4}$");

        // ── Emoji — strip entirely ────────────────────────────────────────
        l = l.replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
             .replace(/[\u{2600}-\u{27FF}]/gu, "")
             .replace(/[\u{2300}-\u{23FF}]/gu, "");

        // ── Escape bare % in text ─────────────────────────────────────────
        l = l.replace(/(?<!\\)%/g, "\\%");

        result.push(l);
      }

      return result.join("\n");
    }

    /** Read .toc file hash to detect if a second pass is actually needed */
    function tocHash(dir: string): string {
      try { return createHash("md5").update(readFileSync(join(dir, "doc.toc"))).digest("hex"); }
      catch { return ""; }
    }

    /**
     * Compile LaTeX in a given tmpDir (reused across passes to preserve .aux/.toc).
     * Uses -draftmode on pass 1 when a pass 2 is likely, then only runs pass 2
     * if the TOC actually changed — skipping it when content is stable.
     */
    async function tryCompile(
      tex: string,
      tmpDir: string,
    ): Promise<{ success: boolean; pdf?: string; log?: string; fullLog?: string }> {
      const needsToc = tex.includes("\\tableofcontents") || tex.includes("\\ref{");

      // Find pdflatex — check PATH first, then common Windows locations
      let pdflatex = "pdflatex";
      try {
        const whichCmd = process.platform === "win32" ? "where pdflatex" : "which pdflatex";
        execSync(whichCmd, { stdio: "ignore" });
      } catch {
        // Not in PATH — check MiKTeX install dir on Windows
        if (process.platform === "win32") {
          const miktexBin = "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64";
          const miktexPdflatex = join(miktexBin, "pdflatex.exe");
          if (existsSync(miktexPdflatex)) {
            pdflatex = miktexPdflatex;
            // Add to PATH so child processes can find other MiKTeX tools
            process.env.PATH = miktexBin + ";" + (process.env.PATH || "");
          }
        }
      }

      const baseCmd = `"${pdflatex}" -interaction=nonstopmode -halt-on-error --enable-installer`;

      try {
        // Diagnostic: catch corruption between extraction and compilation —
        // if this fires, the bug is in sanitizeLatex or in transit from the
        // client, NOT in the original AI generation or server extraction.
        if (!tex.includes("\\begin{document}") || !tex.includes("\\end{document}")) {
          console.error(
            "[LaTeX] tryCompile received LaTeX missing begin/end document!",
            "\n[LaTeX] tex length:", tex.length,
            "\n[LaTeX] first 300 chars:", tex.slice(0, 300),
          );
        }

        writeFileSync(join(tmpDir, "doc.tex"), tex);

        if (needsToc) {
          // Pass 1 in draft mode — builds .aux/.toc without writing PDF (faster)
          await execAsync(`${baseCmd} -draftmode doc.tex`, { cwd: tmpDir, timeout: 20000 });
          const hashBefore = tocHash(tmpDir);

          // Pass 2 — always needed after draftmode to produce the actual PDF
          await execAsync(`${baseCmd} doc.tex`, { cwd: tmpDir, timeout: 20000 });
          const hashAfter = tocHash(tmpDir);

          // Pass 3 only if TOC actually shifted (rare for fresh docs)
          if (hashBefore !== hashAfter) {
            await execAsync(`${baseCmd} doc.tex`, { cwd: tmpDir, timeout: 20000 });
          }
        } else {
          // No TOC — single pass is enough
          await execAsync(`${baseCmd} doc.tex`, { cwd: tmpDir, timeout: 20000 });
        }

        const pdfPath = join(tmpDir, "doc.pdf");
        if (!existsSync(pdfPath)) return { success: false, log: "No output file produced" };
        return { success: true, pdf: readFileSync(pdfPath).toString("base64") };
      } catch {
        let fullLog = "";
        try { fullLog = readFileSync(join(tmpDir, "doc.log"), "utf-8"); } catch {}
        const errorLines = fullLog.split("\n").filter((ln) =>
          ln.startsWith("!") || ln.startsWith("l.") || ln.includes("Emergency stop") || ln.includes("Undefined control")
        );
        const errorMsg = errorLines.slice(0, 10).join("; ") || "LaTeX compilation failed";
        const tail = fullLog.split("\n").slice(-40).join("\n");
        console.error("[LaTeX] Compile error:", errorMsg);
        return { success: false, log: errorMsg, fullLog: tail };
      }
    }

    // Shared tmpDir — reused across all passes so .aux/.toc carry over
    const tmpDir = join("/tmp", `latex-${randomBytes(8).toString("hex")}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      // Pass 1: sanitize then compile
      const sanitized = sanitizeLatex(data.latex);
      const result = await tryCompile(sanitized, tmpDir);
      if (result.success) return { pdf: result.pdf! };

      // Pass 2: ask AI to fix errors, then recompile in same tmpDir
      const { isAIAvailable, aiCompleteChat } = await import("@/lib/ai-nvidia.server");
      if (!isAIAvailable()) throw new Error(result.log || "Compilation failed");

      const fixPrompt = `The following LaTeX document failed to compile with this error:

ERROR SUMMARY:
${result.log}

LOG TAIL (last 40 lines):
${result.fullLog ?? ""}

LATEX DOCUMENT:
${sanitized}

Fix ALL LaTeX errors. Return the corrected LaTeX document with NO explanation, NO markdown fences, and NO extra text — just the raw LaTeX starting with \\documentclass.

Critical rules:
- Escape ALL bare % in text as \\% (e.g. "8.3%" → "8.3\\%", "100%" → "100\\%") — % is a comment in LaTeX
- Escape & in text as \\& (only bare & inside tabular cells is allowed)
- Escape # as \\#, $ as \\$, _ as \\_ in regular text
- Never use Unicode — replace with LaTeX commands (≥ → $\\geq$, — → ---, • → \\textbullet{})
- Never use Markdown (**bold** → \\textbf{}, # heading → \\section{})
- Ensure every \\begin{} has a matching \\end{}
- TABLE COLUMN COUNTS: every row in a tabular/tabularx environment MUST have exactly the same number of & separators as the column spec (e.g. {l|r} = 2 columns = 1 ampersand per row, {lcr} = 3 columns = 2 ampersands per row). "Extra alignment tab" errors mean a row has too many &; count them in every single row, including header rows with \\rowcolor, and fix any mismatch
- Keep all content and structure intact — only fix syntax errors`;

      const fixed = await aiCompleteChat(
        [
          { role: "system", content: "You are a LaTeX error-fixing assistant. Return ONLY corrected LaTeX source code. No explanation, no markdown fences, no extra text. Start directly with \\documentclass." },
          { role: "user", content: fixPrompt },
        ],
        "off",
      );

      const cleanFixed = fixed
        .replace(/^```(?:latex)?\s*/im, "")
        .replace(/```\s*$/m, "")
        .trim();

      const fixedSanitized = sanitizeLatex(cleanFixed);
      // Reuse same tmpDir — .aux/.toc from pass 1 help pdflatex recover faster
      const result2 = await tryCompile(fixedSanitized, tmpDir);
      if (result2.success) return { pdf: result2.pdf! };

      throw new Error(result2.log || "PDF compilation failed after auto-fix");
    } catch (err: any) {
      throw new Error(err.message || "PDF compilation failed");
    } finally {
      // Single cleanup at the very end
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });