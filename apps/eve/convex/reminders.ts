import { CronExpressionParser } from "cron-parser";
import { v } from "convex/values";
import { createThread } from "@convex-dev/agent";

import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { nemo } from "./nemo";

// Reminders on Convex's own scheduler. One-off reminders are a single scheduled
// function - no polling, no lease, no minute-by-minute sweep. Recurring ones
// re-arm themselves after each fire by computing the next cron occurrence, so
// the only clock involved is Convex's.
//
// This is what the eve build could not do: Vercel Hobby caps cron at one run per
// day, which is why reminders there needed an external pinger hitting a secret URL.

export const DEFAULT_TIMEZONE = "America/Toronto";

export function nextCronOccurrence(cron: string, timezone: string, after = new Date()): number {
  return CronExpressionParser.parse(cron, { currentDate: after, tz: timezone }).next().getTime();
}

export const create = mutation({
  args: {
    prompt: v.string(),
    fireAt: v.optional(v.number()),
    cron: v.optional(v.string()),
    timezone: v.optional(v.string()),
    chatId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const timezone = args.timezone ?? DEFAULT_TIMEZONE;
    if ((args.fireAt === undefined) === (args.cron === undefined)) {
      throw new Error("Provide exactly one of fireAt (one-off) or cron (recurring).");
    }
    const nextFireAt =
      args.cron !== undefined ? nextCronOccurrence(args.cron, timezone) : (args.fireAt as number);

    const id = await ctx.db.insert("reminders", {
      prompt: args.prompt,
      cron: args.cron ?? null,
      timezone,
      nextFireAt,
      chatId: args.chatId ?? null,
      leaseUntil: null,
      scheduledId: null,
    });

    // Arm it now; `fire` re-arms recurring reminders after each run.
    const scheduledId = await ctx.scheduler.runAt(nextFireAt, internal.reminders.fire, { id });
    await ctx.db.patch(id, { scheduledId });
    return { id, nextFireAt };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("reminders").withIndex("by_next_fire").collect(),
});

export const cancel = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get(id);
    if (reminder === null) return null;
    // Cancel the pending run too, or it fires into a deleted row.
    if (reminder.scheduledId !== null) await ctx.scheduler.cancel(reminder.scheduledId);
    await ctx.db.delete(id);
    return reminder;
  },
});

/** Re-arms a recurring reminder, or clears a spent one-off. */
export const settle = internalMutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.db.get(id);
    if (reminder === null) return;
    if (reminder.cron === null) {
      await ctx.db.delete(id);
      return;
    }
    const nextFireAt = nextCronOccurrence(reminder.cron, reminder.timezone);
    const scheduledId = await ctx.scheduler.runAt(nextFireAt, internal.reminders.fire, { id });
    await ctx.db.patch(id, { nextFireAt, scheduledId });
  },
});

export const recordRun = internalMutation({
  args: {
    automationId: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("automationRuns", { kind: "reminder", ...args });
  },
});

export const attachThread = internalMutation({
  args: { threadId: v.string(), title: v.string() },
  handler: async (ctx, { threadId, title }) => {
    await ctx.db.insert("threadMeta", {
      threadId,
      title: title.length > 44 ? `${title.slice(0, 44).trimEnd()}...` : title,
      pinned: false,
      renamed: true,
      origin: "reminder",
      unreadAt: Date.now(),
    });
  },
});

export const fire = internalAction({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => {
    const reminder = await ctx.runQuery(internal.reminders.get, { id });
    if (reminder === null) return;

    const cadence =
      reminder.cron === null
        ? "a one-off reminder"
        : `a recurring task (cron "${reminder.cron}", ${reminder.timezone})`;
    const message = [
      `Scheduled ${cadence} you set earlier just fired. Its instruction:`,
      "",
      reminder.prompt,
      "",
      "Carry it out now and send Aveek the result. They didn't just message you - this is",
      "proactive, so lead with what this is about.",
    ].join("\n");

    try {
      const threadId = await createThread(ctx, components.agent);
      await nemo.generateText(ctx, { threadId }, { prompt: message });
      await ctx.runMutation(internal.reminders.attachThread, {
        threadId,
        title: `Reminder: ${reminder.prompt}`,
      });
      await ctx.runMutation(internal.reminders.recordRun, {
        automationId: id,
        status: "ok",
        threadId,
      });
    } catch (error) {
      await ctx.runMutation(internal.reminders.recordRun, {
        automationId: id,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // A failed run still re-arms: a recurring reminder should survive one bad night.
      await ctx.runMutation(internal.reminders.settle, { id });
    }
  },
});

export const get = query({
  args: { id: v.id("reminders") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});
