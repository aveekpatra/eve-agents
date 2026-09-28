import { openrouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelMiddleware, ModelMessage } from "ai";
import { wrapLanguageModel } from "ai";
import { defineAgent, defineDynamic } from "eve";

// Models are called through OpenRouter (OPENROUTER_API_KEY), not the Vercel AI
// Gateway. The web chat's picker can still name any OpenRouter model id.
const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

// The default model's window, which a directly configured provider has to state
// itself: the gateway metadata that would otherwise supply it is not in play.
const CONTEXT_WINDOW_TOKENS = 1_048_576;

// Several OpenRouter providers serve this model at different latencies and
// uptimes; prefer Fireworks rather than take whichever the router picks. Keep
// fallbacks on: Fireworks rate-limits this model upstream from time to time,
// and a hard pin turns that into a failed turn instead of a slower one. Only
// the default is steered - a model chosen in the web picker may not be served
// by Fireworks at all, so those route normally.
const DEFAULT_MODEL_PROVIDER = { order: ["fireworks"], allow_fallbacks: true };

/** The default model carries its provider pin; anything else routes on OpenRouter's own rules. */
function model(id: string) {
  return id === DEFAULT_MODEL ? openrouter(id, { provider: DEFAULT_MODEL_PROVIDER }) : openrouter(id);
}

/** Top of the AI SDK's effort scale; every turn runs here unless a turn asks for less. */
const DEFAULT_REASONING = "xhigh";

const MODEL_ID_PATTERN = /^[\w.-]+\/[\w.:-]+$/;

/** The AI SDK's provider-agnostic reasoning effort levels, minus the default. */
const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningLevel = (typeof REASONING_LEVELS)[number];

function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return typeof value === "string" && (REASONING_LEVELS as readonly string[]).includes(value);
}

const CLIENT_CONTEXT_PREFIX = "Client context:\n";

interface TurnSettings {
  model: string | null;
  reasoning: ReasoningLevel | null;
}

const NO_SETTINGS: TurnSettings = { model: null, reasoning: null };

/**
 * The web chat attaches `{ eveWebModel, eveWebReasoning? }` as one-turn
 * `clientContext`, which the eve channel delivers as a user-role message of
 * the exact form `Client context:\n<json>`. Scan the visible conversation
 * from the end for a message that parses to that shape, so ordinary
 * conversation text merely mentioning the keys cannot match.
 */
function requestedSettings(messages: readonly ModelMessage[]): TurnSettings {
  for (let index = messages.length - 1; index >= 0; index--) {
    const { content } = messages[index];
    const texts =
      typeof content === "string"
        ? [content]
        : content.map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""));
    for (const text of texts) {
      const settings = parseSettingsMarker(text);
      if (settings !== null) return settings;
    }
  }
  return NO_SETTINGS;
}

function parseSettingsMarker(text: string): TurnSettings | null {
  if (!text.startsWith(CLIENT_CONTEXT_PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(CLIENT_CONTEXT_PREFIX.length));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const modelValue = record.eveWebModel;
    const model =
      typeof modelValue === "string" && MODEL_ID_PATTERN.test(modelValue) ? modelValue : null;
    const reasoning = isReasoningLevel(record.eveWebReasoning) ? record.eveWebReasoning : null;
    if (model === null && reasoning === null) return null;
    return { model, reasoning };
  } catch {
    return null;
  }
}

function reasoningMiddleware(reasoning: ReasoningLevel): LanguageModelMiddleware {
  return {
    specificationVersion: "v4",
    // The agent-level default (DEFAULT_REASONING) is already on params by the
    // time this runs, so an explicitly requested level has to overwrite it
    // rather than defer to it - otherwise the picker could only ever raise
    // effort to a level it is already at.
    transformParams: async ({ params }) => ({ ...params, reasoning }),
  };
}

export default defineAgent({
  modelContextWindowTokens: CONTEXT_WINDOW_TOKENS,
  reasoning: DEFAULT_REASONING,
  model: defineDynamic({
    fallback: model(DEFAULT_MODEL),
    events: {
      // Both the picked model and the reasoning effort resolve here. Turn- and
      // session-scoped selections have to be plain id strings, and eve routes
      // those through the AI Gateway - the path this agent no longer uses - so
      // everything rides on a live OpenRouter model, which only step.started
      // accepts. Returning null leaves the scope unset and the fallback wins.
      "step.started": (_event, ctx) => {
        const { model: requestedModel, reasoning } = requestedSettings(ctx.messages);
        if (requestedModel === null && reasoning === null) return null;
        const selected = model(requestedModel ?? DEFAULT_MODEL);
        if (reasoning === null) return selected;
        return wrapLanguageModel({
          model: selected,
          middleware: reasoningMiddleware(reasoning),
        });
      },
    },
  }),
});
