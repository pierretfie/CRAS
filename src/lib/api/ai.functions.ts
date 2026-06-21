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
4. Provide a brief reasoning for your classification.

Respond ONLY in this exact JSON format (no markdown, no code fences):
{"category":"NormalizedCategory","modeOfConnection":"NormalizedMode","stageValue":0,"reasoning":"Brief explanation"}`;

    const userMessage = `Category: "${data.category}"
Mode of connection: "${data.modeOfConnection}"
Stage: ${data.stage} (${data.stageLabel ?? "unknown"})
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
        reasoning: String(parsed.reasoning ?? "AI classified this entry."),
      };
    } catch (err: any) {
      throw new Error(`AI normalization failed: ${err.message || String(err)}`);
    }
  });

/**
 * Server function: AI chat for reports and admin console.
 * Returns the full response text.
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
- When they do ask about data or request a report, respond with the relevant live metrics from the context above formatted in clean markdown.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...data.messages
        .filter((m) => m.content.trim() !== "")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    ];

    try {
      const content = await aiCompleteChat(messages);
      return { content };
    } catch (err: any) {
      throw new Error(`AI generation failed: ${err.message || String(err)}`);
    }
  });
