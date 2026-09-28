import type { ScheduleHandlerArgs } from "eve/schedules";

import telegram from "../channels/telegram";
import { ownerName } from "./owner";
import { recordAutomationRun } from "./runs-db";
import { deliverToWebChatThread } from "./web-thread-delivery";
import { claimDueReminders, completeReminder, releaseReminder, type ReminderRow } from "./reminders-db";

// Shared reminder dispatch, used by two triggers that do the same work:
//   - agent/schedules/reminders.ts   (Vercel Cron; daily on Hobby plans)
//   - agent/channels/cron.ts         (authenticated route for a minute-by-minute
//                                     external pinger, since Hobby cron is daily-only)
// Claims due rows and runs one proactive session per reminder. Delivery follows
// where the reminder was created: rows with a Telegram chat id reply into that
// DM; rows without one (web chat) land as a new web chat thread.

export interface ReminderDispatchArgs {
  receive: ScheduleHandlerArgs["receive"];
  waitUntil: ScheduleHandlerArgs["waitUntil"];
  auth: ScheduleHandlerArgs["appAuth"];
}

function reminderMessage(reminder: ReminderRow): string {
  const cadence =
    reminder.cron === null
      ? "a one-off reminder"
      : `a recurring task (cron "${reminder.cron}", ${reminder.timezone})`;
  return [
    `Scheduled ${cadence} you set earlier (id ${reminder.id}) just fired. Its instruction:`,
    "",
    reminder.prompt,
    "",
    `Carry it out now and send ${ownerName()} the result. They didn't just message you - this is proactive, so lead with what this is about.`,
  ].join("\n");
}

/** Claims every due reminder and dispatches each one. Returns how many it claimed. */
export async function dispatchDueReminders({ receive, waitUntil, auth }: ReminderDispatchArgs): Promise<number> {
  const due = await claimDueReminders();

  for (const reminder of due) {
    waitUntil(
      (async () => {
        try {
          let threadId: string | undefined;
          if (reminder.chat_id !== null) {
            await receive(telegram, {
              message: reminderMessage(reminder),
              target: { chatId: reminder.chat_id },
              auth,
            });
          } else {
            threadId = await deliverToWebChatThread(
              `Reminder: ${reminder.prompt}`,
              reminderMessage(reminder),
              "reminder",
            );
          }
          await completeReminder(reminder);
          await recordAutomationRun({
            kind: "reminder",
            automationId: reminder.id,
            status: "ok",
            threadId,
          });
        } catch (error) {
          console.error(`Reminder ${reminder.id} delivery failed; releasing for retry.`, error);
          await releaseReminder(reminder.id);
          await recordAutomationRun({
            kind: "reminder",
            automationId: reminder.id,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          }).catch(() => undefined);
        }
      })(),
    );
  }

  return due.length;
}
