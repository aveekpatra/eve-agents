// Long-term memory backed by Supermemory. Ported from agent/lib/memory-store.ts;
// the SWR cache went away because Convex queries are already reactive and the
// tools run inside actions.
//
// CONTAINER_TAG is the account-wide bucket these memories live under. It stays
// "micky" - the tag the eve build wrote every existing memory under - because
// renaming it would orphan them rather than move them. Set SUPERMEMORY_CONTAINER_TAG
// to migrate deliberately.
const API_BASE = "https://api.supermemory.ai";

function containerTag(): string {
  return process.env.SUPERMEMORY_CONTAINER_TAG ?? "micky";
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (apiKey === undefined) throw new Error("SUPERMEMORY_API_KEY is not set.");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supermemory ${method} ${path} failed (${response.status}): ${text}`);
  }
  return (text.length > 0 ? JSON.parse(text) : null) as T;
}

export async function addMemory(content: string, permanent: boolean): Promise<string> {
  const result = await call<{ id?: string }>("/v3/documents", "POST", {
    content,
    containerTag: containerTag(),
    metadata: { permanent },
  });
  return result?.id ?? "";
}

export async function searchMemories(query: string, limit = 8) {
  const result = await call<{ results?: Array<Record<string, unknown>> }>("/v4/search", "POST", {
    q: query,
    containerTag: containerTag(),
    limit,
  });
  return (result?.results ?? []).map((row) => ({
    id: String(row.documentId ?? row.id ?? ""),
    content: String(row.content ?? row.memory ?? ""),
    similarity: typeof row.score === "number" ? row.score : 0,
  }));
}

export async function listMemories() {
  const result = await call<{ memories?: Array<Record<string, unknown>> }>("/v3/documents/list", "POST", {
    containerTags: [containerTag()],
    limit: 200,
  });
  return (result?.memories ?? []).map((row) => ({
    id: String(row.id ?? ""),
    content: String(row.content ?? ""),
    permanent: Boolean((row.metadata as { permanent?: boolean } | undefined)?.permanent),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
  }));
}

export async function forgetMemory(id: string): Promise<void> {
  await call(`/v3/documents/${encodeURIComponent(id)}`, "DELETE");
}
