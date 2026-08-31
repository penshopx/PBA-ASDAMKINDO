import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListNotificationsResponse, MarkNotificationReadParams, MarkNotificationReadResponse } from "@workspace/api-zod";
import { auditLogsTable, db, notificationsTable } from "@workspace/db";
import { getAuthenticatedUser, requireUser } from "../lib/auth";
import { logger } from "../lib/logger";
import { syncVerificationSlaReminders } from "../lib/verification-sla";

const router: IRouter = Router();

router.get("/notifications", requireUser, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
  if (user.role === "admin" || user.role === "super_admin") {
    try {
      await syncVerificationSlaReminders();
    } catch (error) {
      logger.error(
        { err: error, userId: user.id },
        "Failed to synchronize verification SLA reminders from notifications",
      );
    }
  }
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, user.id))
    .orderBy(desc(notificationsTable.createdAt));
  res.json(
    ListNotificationsResponse.parse(
      notifications.map((notification) => ({
        ...notification,
        createdAt: notification.createdAt.toISOString(),
      })),
    ),
  );
});

router.patch("/notifications/:id/read", requireUser, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Notifikasi tidak valid." });
    return;
  }
  const actor = getAuthenticatedUser(req);
  const [existing] = await db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, actor.id)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Notifikasi tidak ditemukan." });
    return;
  }

  const [updated] = await db.transaction(async (tx) => {
    const [notification] = await tx
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.id, existing.id))
      .returning();
    if (!existing.read) {
      await tx.insert(auditLogsTable).values({
        id: `audit-${existing.id}`,
        actorUserId: actor.id,
        actorRole: actor.role,
        action: "notification.read",
        entityType: "notification",
        entityId: existing.id,
        fromStatus: "unread",
        toStatus: "read",
        note: existing.title,
      });
    }
    return [notification];
  });
  res.json(
    MarkNotificationReadResponse.parse({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    }),
  );
});

export default router;