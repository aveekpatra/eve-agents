// Model picker options come from OpenRouter's catalog (the agent calls models
// through OpenRouter, not the AI Gateway). The picker is deliberately limited
// to ALLOWED_MODEL_IDS: the agent is tuned for one model right now, and the
// full 400-model catalog is noise. Add ids here to widen it.
const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_MODEL_ID = "deepseek/deepseek-v4.1-flash";
const ALLOWED_MODEL_IDS = new Set([DEFAULT_MODEL_ID]);

interface CatalogEntry {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  architecture?: { output_modalities?: unknown };
}

interface ModelOption {
  id: string;
  name: string;
  description: string | null;
  pricing: { input: string; output: string } | null;
}

function emitsText(entry: CatalogEntry): boolean {
  const modalities = entry.architecture?.output_modalities;
  // Older catalog rows omit the field; keep those rather than silently dropping them.
  if (!Array.isArray(modalities)) return true;
  return modalities.includes("text");
}

function toOption(entry: CatalogEntry): ModelOption | null {
  if (typeof entry.id !== "string" || entry.id.length === 0) return null;
  const input = entry.pricing?.prompt;
  const output = entry.pricing?.completion;
  return {
    id: entry.id,
    name: typeof entry.name === "string" ? entry.name : entry.id,
    description: typeof entry.description === "string" ? entry.description : null,
    pricing: typeof input === "string" && typeof output === "string" ? { input, output } : null,
  };
}

export async function GET() {
  try {
    // The catalog is public, but send the key when present so OpenRouter can
    // scope the list to what this account can actually call.
    const key = process.env.OPENROUTER_API_KEY;
    const response = await fetch(CATALOG_URL, {
      headers: key === undefined || key.length === 0 ? {} : { Authorization: `Bearer ${key}` },
      // The catalog moves slowly; an hour of caching keeps the picker snappy.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return Response.json({ models: [] });

    const payload = (await response.json()) as { data?: unknown };
    const entries = Array.isArray(payload.data) ? (payload.data as CatalogEntry[]) : [];
    const models = entries
      .filter((entry) => typeof entry.id === "string" && ALLOWED_MODEL_IDS.has(entry.id))
      .filter(emitsText)
      .map(toOption)
      .filter((model) => model !== null);

    const preferred = models.find((model) => model.id === DEFAULT_MODEL_ID);
    const rest = models.filter((model) => model.id !== DEFAULT_MODEL_ID);
    return Response.json({ models: preferred === undefined ? models : [preferred, ...rest] });
  } catch {
    return Response.json({ models: [] });
  }
}
