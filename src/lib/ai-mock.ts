/**
 * Mock AI layer for CRAS.
 * Drop-in replacement target: NVIDIA Nemotron 3 Super 120B via OpenAI-compatible SDK.
 * Each exported function mirrors the shape the real model will return so the UI
 * can stay unchanged when keys are added.
 */

const MODE_MAP: Record<string, string> = {
  fb: "Facebook",
  facebook: "Facebook",
  "facebook page": "Facebook",
  ig: "Instagram",
  insta: "Instagram",
  instagram: "Instagram",
  li: "LinkedIn",
  linkedin: "LinkedIn",
  tw: "X (Twitter)",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  yt: "YouTube",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  wa: "WhatsApp",
  email: "Email",
  "cold email": "Email",
  referral: "Referral",
  website: "Company Website",
  "company website": "Company Website",
  "social media": "Social Media",
  direct: "Direct Approach",
  "direct approach": "Direct Approach",
};

function titleCase(s: string) {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizeMode(raw: string): string {
  const key = raw.trim().toLowerCase();
  return MODE_MAP[key] ?? titleCase(raw);
}

export function normalizeCategory(raw: string): string {
  return titleCase(raw);
}

const POSITIVE = [
  "signed",
  "agreed",
  "confirmed",
  "onboarded",
  "paid",
  "contract",
  "closed",
  "deposit",
  "deal",
  "started",
  "active",
  "progressing",
  "interested",
  "demo done",
  "proposal accepted",
];

const NEGATIVE = ["unresponsive", "ghosted", "declined", "rejected", "lost", "no reply", "passed"];

export function classifyStageValue(stage: number, description: string): number {
  const d = description.toLowerCase();
  if (NEGATIVE.some((k) => d.includes(k))) return 0;
  if (POSITIVE.some((k) => d.includes(k))) return 1;
  // default: stage 3 leans 1 if description has any substance
  if (stage === 3 && d.length > 20) return 1;
  return 0;
}

export interface NormalizedClientPayload {
  category: string;
  modeOfConnection: string;
  stageValue: number;
  stageLabel?: string;
  reasoning: string;
}

export function normalizeClientPayload(input: {
  category: string;
  modeOfConnection: string;
  stage: number;
  stageDescription: string;
  stageLabel?: string;
}): NormalizedClientPayload {
  const category = normalizeCategory(input.category);
  const mode = normalizeMode(input.modeOfConnection);
  const value = classifyStageValue(input.stage, input.stageDescription);
  return {
    category,
    modeOfConnection: mode,
    stageValue: value,
    stageLabel: input.stageLabel,
    reasoning: `Normalized category to "${category}", channel to "${mode}". Stage ${input.stage} ${
      value ? "shows meaningful progress" : "is preliminary / inactive"
    } based on description keywords.`,
  };
}

/** Streamed mock chat — yields tokens with a small delay to simulate typewriter. */
export async function* mockChat(
  messages: { role: string; content: string }[],
  analytics: Record<string, unknown>,
): AsyncGenerator<string> {
  const last = messages[messages.length - 1]?.content ?? "";
  const lower = last.toLowerCase();
  let body = "";

  const a = analytics as {
    total: number;
    conversion: number;
    byMode: Record<string, number>;
    byCategory: Record<string, number>;
    stale: number;
    topUsers: { name: string; wins: number }[];
  };

  if (/report|summary|summarize|overview/.test(lower)) {
    const topMode = Object.entries(a.byMode ?? {}).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "n/a";
    const topCat = Object.entries(a.byCategory ?? {}).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "n/a";
    body = `**Executive Summary**\n\nWe currently track **${a.total ?? 0}** clients with an overall conversion rate of **${(
      (a.conversion ?? 0) * 100
    ).toFixed(1)}%**.\n\n- Top acquisition channel: **${topMode}**\n- Strongest category: **${topCat}**\n- Stale clients needing follow-up: **${
      a.stale ?? 0
    }**\n\n**Recommendations**\n1. Double down on ${topMode} — it's our highest-volume channel.\n2. Investigate stalled deals in stage 2; many show no activity in 30+ days.\n3. ${topCat} converts best — consider doubling outreach in that category.`;
  } else if (/channel|mode|connection/.test(lower)) {
    const items = Object.entries(a.byMode ?? {}).sort((x, y) => y[1] - x[1]);
    body = `**Channel breakdown**\n\n${items.map(([k, v]) => `- ${k}: ${v} client(s)`).join("\n")}`;
  } else if (/category/.test(lower)) {
    const items = Object.entries(a.byCategory ?? {}).sort((x, y) => y[1] - x[1]);
    body = `**Categories**\n\n${items.map(([k, v]) => `- ${k}: ${v} client(s)`).join("\n")}`;
  } else if (/stale|stuck|stagnant/.test(lower)) {
    body = `There are **${a.stale ?? 0}** stale clients (no activity in 30+ days). Consider reviewing and marking them as Lost with a reason so they stop weighing down funnel metrics.`;
  } else if (/top|best|performer/.test(lower)) {
    const u = (a.topUsers ?? []).map((x) => `- ${x.name}: ${x.wins} wins`).join("\n") || "No conversions yet.";
    body = `**Top performers**\n\n${u}`;
  } else {
    body = `I have access to your full analytics dataset (${a.total ?? 0} clients, ${(
      (a.conversion ?? 0) * 100
    ).toFixed(1)}% conversion). Ask me about channels, categories, stale clients, top performers, or say "give me a report" for a written summary.`;
  }

  // stream char by char (chunked)
  const chunkSize = 6;
  for (let i = 0; i < body.length; i += chunkSize) {
    yield body.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 12));
  }
}
