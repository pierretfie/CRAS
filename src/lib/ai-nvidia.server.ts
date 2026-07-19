/**
 * NVIDIA Nemotron AI integration — server-only module.
 *
 * Primary model: nvidia/nemotron-3-super-120b-a12b
 *   - Thinking controlled via top-level chat_template_kwargs + reasoning_budget
 *     (passed directly in the request body, NOT via extra_body wrapper)
 *   - Thinking tokens arrive in delta.reasoning_content
 *
 * Uses the OpenAI-compatible SDK via https://integrate.api.nvidia.com/v1
 */
import process from "node:process";
import OpenAI from "openai";
import type { ChatCompletionChunk, ChatCompletion } from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

//const MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1";   // v1 — no thinking support on hosted API
//const MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"; // v1.5 — thinking via /think /no_think directives, but hosted API strips reasoning_content
export const MODEL = "nvidia/nemotron-3-super-120b-a12b"; // supports thinking via chat_template_kwargs + reasoning_content field

const REASONING_BUDGET: Record<string, number> = {
  auto: 1024,
  on: 4096,
};

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client) return _client;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  _client = new OpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
  });
  return _client;
}

export function isAIAvailable(): boolean {
  return !!process.env.NVIDIA_API_KEY;
}

/**
 * Thinking level:
 * - "off"  — no reasoning, direct answer, fastest
 * - "auto" — thinking enabled, budget 1024 tokens (balanced)
 * - "on"   — thinking enabled, budget 4096 tokens (thorough)
 */
export type ThinkingLevel = "off" | "auto" | "on";

/** Full request body shape including NVIDIA-specific fields */
type NvidiaBody = {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  // NVIDIA-specific — sent as top-level fields, not wrapped in extra_body
  chat_template_kwargs?: { enable_thinking: boolean };
  reasoning_budget?: number;
};

type CreateFn<TStream extends boolean> = (
  body: NvidiaBody,
) => Promise<TStream extends true ? Stream<ChatCompletionChunk> : ChatCompletion>;

function buildBody(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  thinking: ThinkingLevel,
  stream: false,
): NvidiaBody & { stream: false };
function buildBody(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  thinking: ThinkingLevel,
  stream: true,
): NvidiaBody & { stream: true };
function buildBody(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  thinking: ThinkingLevel,
  stream: boolean,
): NvidiaBody {
  const isOff = thinking === "off";
  const body: NvidiaBody = {
    model: MODEL,
    messages,
    temperature: isOff ? 0.7 : 0.6,
    top_p: isOff ? 1 : 0.95,
    max_tokens: isOff ? 16384 : 32768,
    stream,
    chat_template_kwargs: { enable_thinking: !isOff },
  };
  if (!isOff) {
    body.reasoning_budget = REASONING_BUDGET[thinking] ?? 1024;
  }
  return body;
}

/**
 * Call Nemotron for a single completion (non-streaming).
 */
export async function aiComplete(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("NVIDIA_API_KEY not configured");

  const create = client.chat.completions.create.bind(client.chat.completions) as CreateFn<false>;
  const completion = await create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  });

  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Call Nemotron with full message history (non-streaming).
 */
export async function aiCompleteChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  thinking: ThinkingLevel = "auto",
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("NVIDIA_API_KEY not configured");

  const create = client.chat.completions.create.bind(client.chat.completions) as CreateFn<false>;
  const completion = await create(buildBody(messages, thinking, false));
  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Call Nemotron with streaming. Yields tagged chunks as they arrive.
 * { type: "think", text } — reasoning token (delta.reasoning_content)
 * { type: "text",  text } — answer token   (delta.content)
 */
export async function* aiStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  thinking: ThinkingLevel = "auto",
): AsyncGenerator<{ type: "think" | "text"; text: string }> {
  const client = getClient();
  if (!client) throw new Error("NVIDIA_API_KEY not configured");

  const create = client.chat.completions.create.bind(client.chat.completions) as CreateFn<true>;
  const stream = await create(buildBody(messages, thinking, true));

  for await (const chunk of stream) {
    if (!chunk.choices?.length) continue;
    const delta = chunk.choices[0].delta as Record<string, unknown>;

    const thinkText = (delta.reasoning_content as string | null | undefined) ?? "";
    if (thinkText) yield { type: "think", text: thinkText };

    const answerText = (delta.content as string | null | undefined) ?? "";
    if (answerText) yield { type: "text", text: answerText };
  }
}
