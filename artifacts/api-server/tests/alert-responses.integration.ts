import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { db, alertResponsesTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { AuthenticatedRequest } from "../src/lib/auth";
import responseRouter from "../src/routes/alert-responses";
import {
  acknowledgeAlertResponse, alertResponseView, detectOverdueAlertResponses, registerAlertResponse,
} from "../src/lib/alert-responses";
import { ListAdminAlertResponsesResponse, AcknowledgeAdminAlertResponse } from "@workspace/api-zod";

const suffix = randomUUID();
const actorIds = [`ack-admin-${suffix}`, `ack-super-${suffix}`, `ack-member-${suffix}`];
const ids = [`ack-on-time-${suffix}`, `ack-late-${suffix}`, `ack-race-${suffix}`];
const app = express();
app.use((req, _res, next) => {
  const index = actorIds.indexOf(String(req.headers["x-test-user"]));
  if (index >= 0) (req as AuthenticatedRequest).currentUser = actors[index]!;
  next();
});
app.use(responseRouter);
const actors = await db.insert(usersTable).values(actorIds.map((id, index) => ({
  id, clerkUserId: id, name: "Synthetic ACK test", email: `${id}@example.test`,
  role: (["admin", "super_admin", "member"] as const)[index]!,
}))).returning();
// returning() order need not match input order.
actors.sort((a, b) => actorIds.indexOf(a.id) - actorIds.indexOf(b.id));
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const headers = { "x-test-user": actorIds[0]! };
try {
  const now = new Date();
  for (const [index, id] of ids.entries()) await registerAlertResponse({
    deduplicationKey: id, name: "Synthetic ACK test",
    triggeredAt: new Date(now.getTime() - (index === 1 ? 25 * 60_000 : 0)).toISOString(),
  });
  const [original] = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, ids[0]!));
  await registerAlertResponse({ deduplicationKey: ids[0]!, name: "Replay", triggeredAt: new Date().toISOString() });
  const [replayed] = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, ids[0]!));
  assert.equal(replayed!.responseDueAt.toISOString(), original!.responseDueAt.toISOString());
  assert.equal(replayed!.alertName, "Synthetic ACK test");
  assert.equal(alertResponseView(replayed!, new Date(replayed!.responseDueAt.getTime() - 1)).responseStatus, "awaiting_ack");
  assert.equal(alertResponseView(replayed!, replayed!.responseDueAt).responseStatus, "overdue");

  let response = await fetch(`${base}/admin/observability/responses`, { headers: { "x-test-user": actorIds[2]! } });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/admin/observability/responses/${ids[0]}/ack`, {
    method: "POST", headers: { "x-test-user": actorIds[2]! },
  });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/admin/observability/responses/missing-${suffix}/ack`, { method: "POST", headers });
  assert.equal(response.status, 404);
  response = await fetch(`${base}/admin/observability/responses`, { headers });
  assert.equal(response.status, 200);
  const list = ListAdminAlertResponsesResponse.parse(await response.json());
  assert.equal(list.find((row) => row.id === ids[1])?.responseStatus, "overdue");

  response = await fetch(`${base}/admin/observability/responses/${ids[0]}/ack`, {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ actorUserId: actorIds[1], acknowledgedAt: "2000-01-01T00:00:00Z" }),
  });
  assert.equal(response.status, 200);
  const onTime = AcknowledgeAdminAlertResponse.parse(await response.json());
  assert.equal(onTime.responseStatus, "acknowledged");
  const [stored] = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, ids[0]!));
  assert.equal(stored!.acknowledgedBy, actorIds[0], "Actor must come from authenticated session");
  const replay = await acknowledgeAlertResponse(ids[0]!, actorIds[1]!);
  assert.equal(replay?.acknowledgedAt, new Date(onTime.acknowledgedAt!).toISOString());
  assert.equal((await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, ids[0]!)))[0]!.acknowledgedBy, actorIds[0]);

  await Promise.all([detectOverdueAlertResponses(), detectOverdueAlertResponses()]);
  const late = await acknowledgeAlertResponse(ids[1]!, actorIds[0]!);
  assert.equal(late?.responseStatus, "acknowledged_late");
  assert.equal(late?.overdueAt, late?.responseDueAt);
  const [first, second] = await Promise.all([
    acknowledgeAlertResponse(ids[2]!, actorIds[0]!),
    acknowledgeAlertResponse(ids[2]!, actorIds[1]!),
  ]);
  assert.equal(first?.acknowledgedAt, second?.acknowledgedAt);
  const persisted = await db.select().from(alertResponsesTable).where(eq(alertResponsesTable.id, ids[1]!));
  assert.equal(alertResponseView(persisted[0]!).responseStatus, "acknowledged_late");
  assert.equal(await acknowledgeAlertResponse(`missing-${suffix}`, actorIds[0]!), null);
  console.log("Alert ACK, deadlines, RBAC, idempotency, concurrency and persistence integration tests passed");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(alertResponsesTable).where(inArray(alertResponsesTable.id, ids));
  await db.delete(usersTable).where(inArray(usersTable.id, actorIds));
}
