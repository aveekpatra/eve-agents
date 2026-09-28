import { createTool } from "@convex-dev/agent";
import { z } from "zod";

import { api } from "./_generated/api";
import { DEFAULT_TIMEZONE } from "./reminders";
import { addMemory, forgetMemory, listMemories, searchMemories } from "./lib/supermemory";

// Nemo's tools. Ported from agent/tools/*.ts - the business logic is unchanged;
// what changes is the wrapper (createTool instead of eve's defineTool) and the
// backing store (Convex tables and its scheduler instead of Neon).

export const remember = createTool({
  description:
    "Save one long-term memory that persists across all future conversations. Use for durable facts and preferences about the user (name, city, habits, likes, ongoing projects). Phrase it entity-centric, e.g. 'Aveek prefers metric units'. Never save secrets, passwords, tokens, or payment details.",
  inputSchema: z.object({
    content: z.string().describe("The fact to remember, phrased entity-centric."),
    permanent: z.boolean().optional().describe("True for durable identity-level facts that should never be pruned."),
  }),
  execute: async (_ctx, { content, permanent }) => {
    const id = await addMemory(content, permanent ?? false);
    return { id, saved: content };
  },
});

export const search_memory = createTool({
  description:
    "Search long-term memory for context about the user. Use whenever past context would help answer well.",
  inputSchema: z.object({ query: z.string().describe("What to look for.") }),
  execute: async (_ctx, { query }) => await searchMemories(query),
});

export const list_memories = createTool({
  description: "List every stored long-term memory, with ids for forgetting.",
  inputSchema: z.object({}),
  execute: async () => await listMemories(),
});

export const forget = createTool({
  description: "Delete one long-term memory by id (find it with list_memories or search_memory).",
  inputSchema: z.object({ id: z.string().describe("The memory's id.") }),
  execute: async (_ctx, { id }) => {
    await forgetMemory(id);
    return { forgotten: id };
  },
});

export const create_reminder = createTool({
  description:
    "Schedule a proactive reminder or task. Nemo wakes at the given time (one-off) or on the cron cadence (recurring), performs the prompt, and reports back. Use for 'remind me to X at 9pm', 'every weekday morning send me my schedule', or any future/recurring task.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe("Instruction to your future self when this fires. The fired session has no chat history, so include all context."),
    fireAt: z.number().optional().describe("One-off: epoch milliseconds to fire at."),
    cron: z
      .string()
      .optional()
      .describe('Recurring: 5-field cron expression evaluated in the timezone (e.g. "0 21 * * *" for 9pm daily).'),
    timezone: z.string().optional().describe(`IANA timezone. Defaults to ${DEFAULT_TIMEZONE}.`),
  }),
  execute: async (ctx, args) => await ctx.runMutation(api.reminders.create, args),
});

export const list_reminders = createTool({
  description:
    "List active reminders and recurring scheduled tasks: id, prompt, next fire time, and cadence. Use when Aveek asks what's scheduled, or to find an id to cancel.",
  inputSchema: z.object({}),
  execute: async (ctx) => await ctx.runQuery(api.reminders.list, {}),
});

export const cancel_reminder = createTool({
  description: "Cancel a scheduled reminder by id (find it with list_reminders).",
  inputSchema: z.object({ id: z.string().describe("The reminder's id.") }),
  // The id arrives as a string from the model; Convex ids are strings at runtime.
  execute: async (ctx, { id }) => await ctx.runMutation(api.reminders.cancel, { id: id as never }),
});

export const roll_dice = createTool({
  description: "Roll dice. Returns each die and the total.",
  inputSchema: z.object({
    sides: z.number().int().min(2).max(1000).describe("Faces per die."),
    count: z.number().int().min(1).max(100).default(1).describe("How many dice to roll."),
  }),
  execute: async (_ctx, { sides, count }) => {
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) };
  },
});

export const tools = {
  remember,
  search_memory,
  list_memories,
  forget,
  create_reminder,
  list_reminders,
  cancel_reminder,
  roll_dice,
};
