import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";

// The Agent component owns threads, messages, streaming deltas and tool-call
// records. Everything Nemo knows that is *not* a conversation (reminders,
// webhooks, receipts, skills, push subscriptions) lives in schema.ts instead.
const app = defineApp();
app.use(agent);

export default app;
