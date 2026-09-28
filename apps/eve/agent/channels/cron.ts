import { timingSafeEqual } from "node:crypto";

import { defineChannel, POST } from "eve/channels";

import { dispatchDueReminders } from "../lib/reminder-dispatch";

// External cron entrypoint for the reminder dispatcher.
//
// Reminders need minute granularity, but Vercel Hobby projects only allow one
// cron run per day, so agent/schedules/reminders.ts runs as a daily safety-net
// sweep and an external scheduler (cron-job.org, GitHub Actions, any host with
// a real crontab) hits this route every minute instead. The secret rides in the
// path because most cron services can only be given a bare URL.
//
// Mounted at POST /eve/v1/cron/reminders/:secret. Set REMINDER_CRON_SECRET to
// enable it; while that variable is unset the route 404s like any unknown path.

const APP_AUTH = {
  authenticator: "cron",
  principalType: "service",
  principalId: "cron:reminders",
  attributes: {},
} as const;

function secretsMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default defineChannel({
  routes: [
    POST("/eve/v1/cron/reminders/:secret", async (_req, { receive, waitUntil, params }) => {
      const expected = process.env.REMINDER_CRON_SECRET ?? "";
      // One 404 for both "disabled" and "wrong secret", so probing reveals nothing.
      if (expected.length === 0 || !secretsMatch(expected, params.secret)) {
        return new Response("Not found", { status: 404 });
      }

      const claimed = await dispatchDueReminders({ receive, waitUntil, auth: APP_AUTH });

      // Ack immediately; the claimed reminders run on in the background.
      return Response.json({ ok: true, claimed });
    }),
  ],
});
