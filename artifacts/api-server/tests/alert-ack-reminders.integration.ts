import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  db, alertResponsesTable, operationalAlertDeliveriesTable, usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createAlertTestSchema } from "./helpers/alert-test-schema";
import {
  acknowledgeAlertResponse,
  detectOverdueAlertResponses,
  listAlertResponses,
  processDueAlertResponseReminders,
  registerAlertResponse,
} from "../src/lib/alert-responses";
import { sendOnCallAcknowledgementReminder } from "../src/lib/alert-delivery";

const schema = await createAlertTestSchema();
const suffix = randomUUID();
const actorId = `ack-reminder-admin-${suffix}`;
const incidentIds = Array.from({ length: 5 }, (_, index) => `ack-reminder-${index}-${suffix}`);
const now = new Date();
const oldTrigger = new Date(now.getTime() - 10 * 60_000);
const owner = randomUUID();
const previousEnvironment = {
  ackTimeout: process.env.ON_CALL_ACK_TIMEOUT_MINUTES,
  maxAttempts: process.env.ON_CALL_ACK_REMINDER_MAX_ATTEMPTS,
  interval: process.env.ON_CALL_ACK_REMINDER_INTERVAL_MINUTES,
  channel: process.env.ON_CALL_CHANNEL,
  slackChannel: process.env.ON_CALL_SLACK_CHANNEL_ID,
};
process.env.ON_CALL_ACK_TIMEOUT_MINUTES = "1";
process.env.ON_CALL_ACK_REMINDER_MAX_ATTEMPTS = "3";
process.env.ON_CALL_ACK_REMINDER_INTERVAL_MINUTES = "1";

async function createDeliveredIncident(
  id: string,
  name = "Synthetic overdue alert",
  remindersEnabled = false,
) {
  await registerAlertResponse(
    { deduplicationKey: id, name, triggeredAt: oldTrigger.toISOString() },
    remindersEnabled,
  );
  await db.insert(operationalAlertDeliveriesTable).values({
    deduplicationKey: id,
    alertName: name,
    status: "delivered",
    attempts: 1,
    lastAttemptAt: oldTrigger,
    deliveredAt: oldTrigger,
    error: null,
    owner,
    leaseUntil: new Date(now.getTime() + 60_000),
  });
}

await db.insert(usersTable).values({
  id: actorId,
  clerkUserId: actorId,
  name: "Synthetic ACK reminder test",
  email: `${actorId}@example.test`,
  role: "admin",
});

try {
  await Promise.all(incidentIds.map((id, index) =>
    createDeliveredIncident(id, "Synthetic overdue alert", index === 0),
  ));
  await detectOverdueAlertResponses(now);

  const sent: Array<{ incidentId: string; attempt: number; deliveryKey: string }> = [];
  await Promise.all([1, 2].map(() => processDueAlertResponseReminders({
    now,
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => sent.push(reminder),
  })));
  assert.equal(sent.length, 1, "A missing ACK should trigger one controlled reminder");
  assert.equal(sent[0]?.incidentId, incidentIds[0], "The reminder retains the original incident ID");
  assert.equal(sent[0]?.attempt, 1);
  const [firstResponse] = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, incidentIds[0]!));
  assert.equal(firstResponse!.acknowledgedAt, null, "Sending a reminder must not create an ACK");
  assert.equal(firstResponse!.ackReminderStatus, "delivered");
  assert.equal(firstResponse!.ackReminderAttempts, 1);
  const [firstReminderDelivery] = await db.select().from(operationalAlertDeliveriesTable)
    .where(eq(operationalAlertDeliveriesTable.deduplicationKey, sent[0]!.deliveryKey));
  assert.equal(firstReminderDelivery!.status, "delivered", "Reminder delivery uses the shared delivery history");
  await processDueAlertResponseReminders({
    now,
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => sent.push(reminder),
  });
  assert.equal(sent.length, 1, "The shared schedule prevents an immediate duplicate");
  await acknowledgeAlertResponse(incidentIds[0]!, actorId);

  // The sender holds the response row lock through the Slack side effect, so a
  // concurrent ACK is ordered after a reminder already in progress.
  await db.update(alertResponsesTable).set({ ackReminderEnabled: true })
    .where(eq(alertResponsesTable.id, incidentIds[1]!));
  let signalSendStarted!: () => void;
  let releaseSend!: () => void;
  const sendStarted = new Promise<void>((resolve) => { signalSendStarted = resolve; });
  const sendGate = new Promise<void>((resolve) => { releaseSend = resolve; });
  const raceSend: string[] = [];
  const raceProcessing = processDueAlertResponseReminders({
    now,
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => {
      raceSend.push(reminder.incidentId);
      signalSendStarted();
      await sendGate;
    },
  });
  await sendStarted;
  let ackFinished = false;
  const concurrentAck = acknowledgeAlertResponse(incidentIds[1]!, actorId).then((result) => {
    ackFinished = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(ackFinished, false, "ACK waits while a reminder is already being delivered");
  releaseSend();
  await raceProcessing;
  const raceAckResult = await concurrentAck;
  assert.equal(raceSend.length, 1);
  assert.equal(raceAckResult?.acknowledgedAt !== null, true);
  const [raceResponse] = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, incidentIds[1]!));
  assert.equal(raceResponse!.ackReminderStatus, "delivered", "Delivery history remains separate from ACK state");
  assert.equal(raceResponse!.acknowledgedAt !== null, true);

  await db.update(alertResponsesTable).set({ ackReminderEnabled: true })
    .where(eq(alertResponsesTable.id, incidentIds[2]!));
  const stoppedAck = await acknowledgeAlertResponse(incidentIds[2]!, actorId);
  assert.ok(stoppedAck?.acknowledgedAt, "ACK before a due reminder is retained");
  const beforeAckWon = sent.length;
  await processDueAlertResponseReminders({
    now,
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => sent.push(reminder),
  });
  assert.equal(sent.length, beforeAckWon, "An already recorded ACK prevents a reminder");

  // A process restart with an expired pending lease is ambiguous. It is marked
  // interrupted and is not replayed automatically, even on later worker runs.
  const interruptedId = incidentIds[3]!;
  await db.update(alertResponsesTable).set({ ackReminderEnabled: true })
    .where(eq(alertResponsesTable.id, interruptedId));
  const interruptedDeliveryKey = randomUUID();
  await db.update(alertResponsesTable).set({
    ackReminderStatus: "pending",
    ackReminderAttempts: 1,
    ackReminderLastAttemptAt: new Date(now.getTime() - 120_000),
    ackReminderNextAttemptAt: new Date(now.getTime() - 60_000),
    ackReminderDeliveryKey: interruptedDeliveryKey,
  }).where(eq(alertResponsesTable.id, interruptedId));
  await db.insert(operationalAlertDeliveriesTable).values({
    deduplicationKey: interruptedDeliveryKey,
    alertName: `ACK reminder for ${interruptedId}`,
    status: "pending",
    attempts: 1,
    lastAttemptAt: new Date(now.getTime() - 120_000),
    deliveredAt: null,
    error: null,
    owner: randomUUID(),
    leaseUntil: new Date(now.getTime() - 60_000),
  });
  let restartSends = 0;
  await processDueAlertResponseReminders({
    now,
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => {
      if (reminder.incidentId === interruptedId) restartSends += 1;
    },
  });
  await processDueAlertResponseReminders({
    now: new Date(now.getTime() + 60 * 60_000),
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => {
      if (reminder.incidentId === interruptedId) restartSends += 1;
    },
  });
  const [interruptedResponse] = await db.select().from(alertResponsesTable)
    .where(eq(alertResponsesTable.id, interruptedId));
  const [interruptedDelivery] = await db.select().from(operationalAlertDeliveriesTable)
    .where(eq(operationalAlertDeliveriesTable.deduplicationKey, interruptedDeliveryKey));
  assert.equal(restartSends, 0, "An interrupted Slack attempt is never replayed automatically");
  assert.equal(interruptedResponse!.ackReminderStatus, "interrupted");
  assert.equal(interruptedDelivery!.error, "delivery_interrupted");

  // Repeated provider failures are retried only on the configured interval and
  // stop after the hard attempt limit; these callbacks never reach Slack.
  const retryId = incidentIds[4]!;
  await db.update(alertResponsesTable).set({ ackReminderEnabled: true })
    .where(eq(alertResponsesTable.id, retryId));
  let retryCount = 0;
  let retryTime = new Date(now.getTime() + 10_000);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await processDueAlertResponseReminders({
      now: retryTime,
      maxAttempts: 3,
      intervalMs: 60_000,
      send: async (reminder) => {
        if (reminder.incidentId !== retryId) return;
        retryCount++;
        throw new Error("synthetic provider failure");
      },
    });
    retryTime = new Date(retryTime.getTime() + 60_001);
  }
  await processDueAlertResponseReminders({
    now: retryTime,
    maxAttempts: 3,
    intervalMs: 60_000,
    send: async (reminder) => {
      if (reminder.incidentId === retryId) retryCount += 1;
    },
  });
  const retryRecords = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, retryId));
  assert.equal(retryCount, 3);
  assert.equal(retryRecords[0]!.ackReminderAttempts, 3);
  assert.equal(retryRecords[0]!.ackReminderStatus, "failed");
  assert.equal((await listAlertResponses()).find((response) => response.id === retryId)?.reminderExhausted, true);
  const retryDeliveries = await db.select().from(operationalAlertDeliveriesTable)
    .where(inArray(operationalAlertDeliveriesTable.alertName, [
      `ACK reminder 1 for ${retryId}`,
      `ACK reminder 2 for ${retryId}`,
      `ACK reminder 3 for ${retryId}`,
    ]));
  assert.equal(retryDeliveries.length, 3, "Each retry is stored in the existing delivery history");
  assert.ok(retryDeliveries.every((delivery) => delivery.status === "failed"));

  // Verify the production sender only targets the approved Slack channel. The
  // connector is stubbed, so this assertion sends no real message.
  process.env.ON_CALL_CHANNEL = "slack";
  process.env.ON_CALL_SLACK_CHANNEL_ID = "C012345";
  const originalProxy = ReplitConnectors.prototype.proxy;
  const messages: Array<{ channel: string; text: string; client_msg_id: string }> = [];
  try {
    ReplitConnectors.prototype.proxy = async function (connector, path, options) {
      assert.equal(connector, "slack");
      assert.equal(path, "/chat.postMessage");
      const body = options?.body as { channel: string; text: string; client_msg_id: string };
      messages.push(body);
      return Response.json({ ok: true, ts: "123.456" });
    };
    await sendOnCallAcknowledgementReminder({
      incidentId: incidentIds[0]!,
      alertName: "Synthetic overdue alert",
      responseDueAt: oldTrigger.toISOString(),
      deliveryKey: randomUUID(),
      attempt: 1,
    });
    assert.equal(messages[0]?.channel, "C012345");
    assert.match(messages[0]?.text ?? "", new RegExp(`ID insiden: ${incidentIds[0]}`));
    assert.match(messages[0]?.text ?? "", /penyelesaian insiden tetap langkah terpisah/);
    process.env.ON_CALL_CHANNEL = "webhook";
    await assert.rejects(sendOnCallAcknowledgementReminder({
      incidentId: incidentIds[0]!,
      alertName: "Synthetic overdue alert",
      responseDueAt: oldTrigger.toISOString(),
      deliveryKey: randomUUID(),
      attempt: 2,
    }), /slack_channel_not_configured/);
    assert.equal(messages.length, 1, "No webhook or other channel is used for ACK reminders");
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
  }

  console.log("ACK reminder deadlines, concurrent ACK, restart, bounded retry and Slack-only tests passed");
} finally {
  await db.delete(alertResponsesTable).where(inArray(alertResponsesTable.id, incidentIds));
  await db.delete(usersTable).where(eq(usersTable.id, actorId));
  for (const [name, value] of Object.entries({
    ON_CALL_ACK_TIMEOUT_MINUTES: previousEnvironment.ackTimeout,
    ON_CALL_ACK_REMINDER_MAX_ATTEMPTS: previousEnvironment.maxAttempts,
    ON_CALL_ACK_REMINDER_INTERVAL_MINUTES: previousEnvironment.interval,
    ON_CALL_CHANNEL: previousEnvironment.channel,
    ON_CALL_SLACK_CHANNEL_ID: previousEnvironment.slackChannel,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await schema.cleanup();
}
