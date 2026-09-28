import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Application state. Conversations themselves belong to the Agent component,
// so a thread appears here only for what the component does not model: the
// sidebar's pin/rename/unread affordances and where a thread came from.
export default defineSchema({
  threadMeta: defineTable({
    threadId: v.string(),
    title: v.string(),
    pinned: v.boolean(),
    // Set when the title was chosen deliberately, so auto-titling leaves it alone.
    renamed: v.boolean(),
    origin: v.union(v.literal("web"), v.literal("telegram"), v.literal("reminder"), v.literal("webhook")),
    // Null once the owner has opened the thread since its last proactive message.
    unreadAt: v.union(v.number(), v.null()),
  })
    .index("by_thread", ["threadId"])
    .index("by_pinned", ["pinned"]),

  reminders: defineTable({
    prompt: v.string(),
    // Exactly one of these: a cron expression for recurring, or nothing for one-off.
    cron: v.union(v.string(), v.null()),
    timezone: v.string(),
    nextFireAt: v.number(),
    // Telegram chat to answer in; null means the reminder belongs to web chat.
    chatId: v.union(v.string(), v.null()),
    // Set while a dispatch is in flight so a retry cannot double-fire it.
    leaseUntil: v.union(v.number(), v.null()),
    // Convex's own scheduled-function id for one-off reminders, so cancelling
    // a reminder also cancels the scheduled run rather than leaving it to fire.
    scheduledId: v.union(v.id("_scheduled_functions"), v.null()),
  })
    .index("by_next_fire", ["nextFireAt"]),

  webhooks: defineTable({
    name: v.string(),
    prompt: v.string(),
    secret: v.string(),
    chatId: v.union(v.string(), v.null()),
    fireCount: v.number(),
    lastFiredAt: v.union(v.number(), v.null()),
  }).index("by_name", ["name"]),

  automationRuns: defineTable({
    kind: v.union(v.literal("reminder"), v.literal("webhook")),
    automationId: v.string(),
    status: v.union(v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()),
    threadId: v.optional(v.string()),
  }).index("by_automation", ["kind", "automationId"]),

  pushSubscriptions: defineTable({
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  }).index("by_endpoint", ["endpoint"]),

  receipts: defineTable({
    amount: v.number(),
    currency: v.string(),
    merchant: v.string(),
    category: v.string(),
    note: v.optional(v.string()),
    spentAt: v.number(),
  }).index("by_spent_at", ["spentAt"]),

  skills: defineTable({
    name: v.string(),
    description: v.string(),
    body: v.string(),
  }).index("by_name", ["name"]),
});
