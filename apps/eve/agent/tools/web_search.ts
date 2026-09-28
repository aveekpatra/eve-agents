import { disableTool } from "eve/tools";

// The harness's built-in web_search is provider-managed: it has no local
// executor, and at step time the harness swaps in whatever the model provider
// offers. Routing through OpenRouter, that resolves to the AI Gateway's
// parallelSearch, which goes out as a bare `{ "type": "gateway:parallel_search" }`
// tool entry with no `function` body. Gateway understands it; every OpenRouter
// upstream (Fireworks, Parasail, …) rejects the whole request with a 400
// validation error, so every turn failed with "Provider returned error".
//
// The agent reaches the web through its sandboxed browser extension instead,
// so drop the built-in rather than keep a tool no provider here can serve.
export default disableTool();
