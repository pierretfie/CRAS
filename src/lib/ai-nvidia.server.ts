/**
 * NVIDIA Nemotron AI integration — server-only module.
 *
 * Uses the OpenAI-compatible SDK to call NVIDIA's Nemotron 3 Super 120B
 * model via https://integrate.api.nvidia.com/v1
 *
 * Falls back to local mock when NVIDIA_API_KEY is not set.
 */
import process from "node:process";
import OpenAI from "openai";

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
 * Call Nemotron for a single completion (non-streaming).
 * Returns the text content of the response.
 */
export async function aiComplete(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("NVIDIA_API_KEY not configured");

  const completion = await client.chat.completions.create({
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.6,
    max_tokens: 2048,
  });

  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Call Nemotron with full message history (non-streaming).
 */
export async function aiCompleteChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  const client = getClient();
  if (!client) throw new Error("NVIDIA_API_KEY not configured");

  const completion = await client.chat.completions.create({
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    messages,
    temperature: 0.7,
    max_tokens: 2048,
  });

  return completion.choices[0]?.message?.content ?? "";
}

/**
 * Call Nemotron with streaming. Yields string chunks as they arrive.
 */
export async function* aiStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): AsyncGenerator<string> {
  const client = getClient();
  if (!client) throw new Error("NVIDIA_API_KEY not configured");

  const completion = await client.chat.completions.create({
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    messages,
    temperature: 0.7,
    max_tokens: 4096,
    stream: true,
  });

  for await (const chunk of completion) {
    if (chunk.choices?.length) {
      const delta = chunk.choices[0].delta;
      const content = delta.content ?? "";
      if (content) yield content;
    }
  }
}
