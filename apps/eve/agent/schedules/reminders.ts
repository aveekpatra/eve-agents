import { defineSchedule } from "eve/schedules";

import { dispatchDueReminders } from "../lib/reminder-dispatch";

// Daily safety-net sweep for application-managed reminders (see
// lib/reminders-db.ts). The dispatch itself lives in lib/reminder-dispatch.ts.
//
// Minute-by-minute firing comes from the external pinger that calls
// agent/channels/cron.ts: Vercel Hobby projects reject any cron expression that
// runs more than once a day, so this schedule only catches rows the pinger
// missed (pinger outage, secret rotated). On a Pro plan you can set this back to
// "* * * * *" and drop the external pinger entirely.
export default defineSchedule({
  cron: "10 8 * * *",
  async run({ receive, waitUntil, appAuth }) {
    await dispatchDueReminders({ receive, waitUntil, auth: appAuth });
  },
});
