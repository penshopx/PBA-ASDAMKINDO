import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListNotificationsResponse } from "@workspace/api-zod";
import { db, notificationsTable } from "@workspace/db";
import { getAuthenticatedUser, requireUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/notifications", requireUser, async (req, res): Promise<void> => {
  const user = getAuthenticatedUser(req);
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

export default router;