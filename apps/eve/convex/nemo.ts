import { openrouter } from "@openrouter/ai-sdk-provider";
import { Agent, stepCountIs } from "@convex-dev/agent";

import { components } from "./_generated/api";
import { tools } from "./tools";

// Nemo's model configuration, carried over from the eve build: OpenRouter
// rather than the Vercel AI Gateway, DeepSeek V4.1 Flash by default, Fireworks
// preferred but never pinned hard (it rate-limits upstream, and a hard pin
// turns that into a failed turn instead of a slower one).
const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";
const DEFAULT_MODEL_PROVIDER = { order: ["fireworks"], allow_fallbacks: true };

export const INSTRUCTIONS = [
  "You are Nemo, a proactive personal AI assistant. You work for Aveek, your only",
  "user; treat every conversation as coming from them. Address them as Aveek, and",
  "refer to yourself as Nemo when you need to name yourself.",
  "",
  "Be concise by default. Lead with the answer, keep detail for when asked. Be warm",
  "but not chatty, and skip filler like 'Great question!'.",
].join("\n");

export const nemo = new Agent(components.agent, {
  name: "Nemo",
  languageModel: openrouter(DEFAULT_MODEL, { provider: DEFAULT_MODEL_PROVIDER }),
  instructions: INSTRUCTIONS,
  tools,
  // A turn may call tools and come back; this caps a runaway loop.
  stopWhen: stepCountIs(10),
});
