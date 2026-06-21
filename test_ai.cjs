const fs = require("fs");
const OpenAI = require("openai");

// Manually parse .env
const envFile = fs.readFileSync(".env", "utf8");
let apiKey = "";
for (const line of envFile.split("\n")) {
  if (line.startsWith("NVIDIA_API_KEY=")) {
    apiKey = line.split("=")[1].replace(/['"]/g, "").trim();
  }
}

console.log("Using API Key:", apiKey ? apiKey.substring(0, 10) + "..." : "undefined");

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: apiKey,
});

async function main() {
  try {
    const completion = await client.chat.completions.create({
      model: "nvidia/llama-3.3-nemotron-super-49b-v1",
      messages: [{ role: "user", content: "Hello, reply with only the word SUCCESS if you receive this." }],
      temperature: 0.6,
      max_tokens: 50,
    });
    console.log("Response:", completion.choices[0]?.message?.content);
  } catch (error) {
    console.error("Error calling API:", error);
  }
}

main();
