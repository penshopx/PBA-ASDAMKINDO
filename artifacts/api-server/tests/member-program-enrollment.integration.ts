import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  enrollmentsTable,
  programsTable,
  usersTable,
  type User,
} from "@workspace/db";
import type { AuthenticatedRequest } from "../src/lib/auth";
import adminRouter from "../src/routes/admin";
import memberJourneyRouter from "../src/routes/member-journey";

const suffix = randomUUID();
const memberIds = [`member-enroll-a-${suffix}`, `member-enroll-b-${suffix}`];
const adminId = `admin-enroll-${suffix}`;
const actorIds = [...memberIds, adminId];
const programId = `program-last-seat-${suffix}`;
const actors = new Map<string, User>();

const app = express();
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  const actor = actors.get(String(req.headers["x-test-user-id"] ?? ""));
  if (!actor) {
    res.status(401).json({ error: "Test user tidak ditemukan." });
    return;
  }
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = actor.id;
  authenticated.currentUser = actor;
  next();
});
app.use("/api", memberJourneyRouter, adminRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}/api`;

async function enroll(memberId: string) {
  const response = await fetch(`${baseUrl}/member/programs/${programId}/enrollment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user-id": memberId },
  });
  return { response, body: await response.json() };
}

try {
  await db.insert(usersTable).values(memberIds.map((id, index) => ({
    id,
    clerkUserId: id,
    name: `Member Kursi ${index + 1}`,
    email: `${id}@example.test`,
    role: "member",
    onboardingComplete: true,
  })).concat([{
    id: adminId,
    clerkUserId: adminId,
    name: "Admin Kursi",
    email: `${adminId}@example.test`,
    role: "admin",
    onboardingComplete: true,
  }]));
  const insertedUsers = await db.select().from(usersTable).where(inArray(usersTable.id, actorIds));
  for (const user of insertedUsers) actors.set(user.id, user);

  await db.insert(programsTable).values({
    id: programId,
    name: "Bimtek Kursi Terakhir",
    category: "Manajemen proyek",
    mode: "online",
    schedule: "Oktober 2026",
    duration: "2 hari",
    price: "0",
    instructor: "PBA ASDAMKINDO",
    description: "Program sintetis untuk menguji kapasitas.",
    status: "published",
    capacity: 1,
  });

  const attempts = await Promise.all(memberIds.map(enroll));
  assert.deepEqual(attempts.map(({ response }) => response.status).sort(), [201, 409]);
  assert.equal(
    attempts.find(({ response }) => response.status === 409)?.body.error,
    "Kapasitas program sudah penuh.",
  );

  const savedEnrollments = await db
    .select()
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.programId, programId), eq(enrollmentsTable.status, "pending")));
  assert.equal(savedEnrollments.length, 1);
  assert.equal(memberIds.includes(savedEnrollments[0]!.memberUserId), true);

  const auditRows = await db
    .select()
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.entityId, savedEnrollments[0]!.id),
      eq(auditLogsTable.action, "enrollment.created"),
    ));
  assert.equal(auditRows.length, 1);

  const duplicate = await enroll(savedEnrollments[0]!.memberUserId);
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error, "Anda sudah terdaftar pada program ini.");

  const waitingMemberId = memberIds.find((id) => id !== savedEnrollments[0]!.memberUserId)!;
  const cancelledEnrollmentId = `cancelled-enrollment-${suffix}`;
  await db.insert(enrollmentsTable).values({
    id: cancelledEnrollmentId,
    programId,
    memberUserId: waitingMemberId,
    memberName: actors.get(waitingMemberId)!.name,
    status: "cancelled",
  });
  const adminReactivation = await fetch(`${baseUrl}/admin/enrollments/${cancelledEnrollmentId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-test-user-id": adminId },
    body: JSON.stringify({ status: "enrolled", note: "Aktifkan kembali peserta." }),
  });
  assert.equal(adminReactivation.status, 409);
  assert.equal((await adminReactivation.json()).error, "Kapasitas program sudah penuh.");

  console.info("member program enrollment integration tests passed");
} finally {
  await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, actorIds));
  await db.delete(enrollmentsTable).where(eq(enrollmentsTable.programId, programId));
  await db.delete(programsTable).where(eq(programsTable.id, programId));
  await db.delete(usersTable).where(inArray(usersTable.id, actorIds));
  server.close();
}