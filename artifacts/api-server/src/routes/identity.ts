import { Router, type IRouter } from "express";
import {
  GetCurrentUserResponse,
  SaveCompanyOnboardingBody,
  SaveMemberOnboardingBody,
  SaveCompanyOnboardingResponse,
  SaveMemberOnboardingResponse,
} from "@workspace/api-zod";
import {
  companyProfilesTable,
  db,
  memberProfilesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthenticatedUser, requireUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/me", requireUser, async (req, res): Promise<void> => {
  res.json(GetCurrentUserResponse.parse(getAuthenticatedUser(req)));
});

router.post("/onboarding/member", requireUser, async (req, res): Promise<void> => {
  const parsed = SaveMemberOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data anggota belum lengkap atau tidak valid." });
    return;
  }

  const user = getAuthenticatedUser(req);
  if (user.role !== "member" && user.onboardingComplete) {
    res.status(403).json({ error: "Akun ini tidak dapat memakai onboarding anggota." });
    return;
  }

  await db
    .insert(memberProfilesTable)
    .values({
      id: `${user.id}-profile`,
      userId: user.id,
      ...parsed.data,
      experienceYears: Math.round(parsed.data.experienceYears),
    })
    .onConflictDoUpdate({
      target: memberProfilesTable.userId,
      set: {
        ...parsed.data,
        experienceYears: Math.round(parsed.data.experienceYears),
        updatedAt: new Date(),
      },
    });
  const [updated] = await db
    .update(usersTable)
    .set({ onboardingComplete: true, name: parsed.data.fullName, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(SaveMemberOnboardingResponse.parse(updated));
});

router.post("/onboarding/company", requireUser, async (req, res): Promise<void> => {
  const parsed = SaveCompanyOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data perusahaan belum lengkap atau tidak valid." });
    return;
  }

  const user = getAuthenticatedUser(req);
  if (user.role !== "member" && user.role !== "company") {
    res.status(403).json({ error: "Akun admin tidak memerlukan onboarding perusahaan." });
    return;
  }

  await db
    .insert(companyProfilesTable)
    .values({
      id: `${user.id}-company`,
      userId: user.id,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: companyProfilesTable.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    });
  const [updated] = await db
    .update(usersTable)
    .set({
      onboardingComplete: true,
      role: "company",
      name: parsed.data.picName,
      email: parsed.data.businessEmail,
      organization: parsed.data.companyName,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json(SaveCompanyOnboardingResponse.parse(updated));
});

export default router;