import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, usersTable, type User } from "@workspace/db";

export type AuthenticatedRequest = Request & { userId: string; currentUser: User };

export async function resolveCurrentUser(req: Request): Promise<User | null> {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  if (!clerkUserId) return null;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing;

  const claims = auth.sessionClaims as Record<string, unknown> | undefined;
  const name =
    typeof claims?.name === "string" && claims.name.trim()
      ? claims.name
      : "Anggota Baru";
  const email =
    typeof claims?.email === "string" && claims.email.trim()
      ? claims.email
      : `${clerkUserId}@akun.pba.local`;
  const [created] = await db
    .insert(usersTable)
    .values({
      id: clerkUserId,
      clerkUserId,
      name,
      email,
    })
    .returning();
  return created ?? null;
}

export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Silakan masuk untuk melanjutkan." });
    return;
  }
  const authenticated = req as AuthenticatedRequest;
  authenticated.userId = user.id;
  authenticated.currentUser = user;
  next();
}

export function getAuthenticatedUser(req: Request): User {
  return (req as AuthenticatedRequest).currentUser;
}