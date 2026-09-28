import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { listUIMessages, syncStreams, vStreamArgs, createThread } from "@convex-dev/agent";

import { components } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { nemo } from "./nemo";

// Chat surface. Messages stream as deltas written to the database, so every
// connected client follows the same subscription and a dropped connection
// resumes instead of losing the response - the reason this moved off the
// HTTP-streaming setup.

export const createChatThread = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title }) => {
    const threadId = await createThread(ctx, components.agent);
    await ctx.db.insert("threadMeta", {
      threadId,
      title: title ?? "New chat",
      pinned: false,
      renamed: title !== undefined,
      origin: "web",
      unreadAt: null,
    });
    return threadId;
  },
});

export const sendMessage = action({
  args: { threadId: v.string(), prompt: v.string() },
  handler: async (ctx, { threadId, prompt }) => {
    await nemo.streamText(
      ctx,
      { threadId },
      { prompt },
      // Persist the deltas so clients subscribe to them rather than holding an
      // open HTTP stream.
      { saveStreamDeltas: true },
    );
  },
});

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const meta = await ctx.db.query("threadMeta").order("desc").collect();
    // Pinned threads sort first; the rest stay in most-recent-first order.
    return [...meta.filter((t) => t.pinned), ...meta.filter((t) => !t.pinned)];
  },
});
