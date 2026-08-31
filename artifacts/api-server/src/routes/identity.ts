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
import { and, eq } from "drizzle-orm";
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
  if (user.role !== "member" || user.onboardingComplete) {
    res.status(403).json({ error: "Akun ini tidak dapat memakai onboarding anggota." });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(usersTable)
      .set({ onboardingComplete: true, name: parsed.data.fullName, updatedAt: new Date() })
      .where(and(
        eq(usersTable.id, user.id),
        eq(usersTable.role, "member"),
        eq(usersTable.onboardingComplete, false),
      ))
      .returning();
    if (!claimed) return null;
    await tx
      .insert(memberProfilesTable)
      .values({
        id: `${user.id}-profile`,
        userId: user.id,
        ...parsed.data,
        jobTitle: parsed.data.jobTitle ?? "",
        skkLevel: Math.round(parsed.data.skkLevel ?? 0),
        experienceYears: Math.round(parsed.data.experienceYears),
      })
      .onConflictDoUpdate({
        target: memberProfilesTable.userId,
        set: {
          ...parsed.data,
          jobTitle: parsed.data.jobTitle ?? "",
          skkLevel: Math.round(parsed.data.skkLevel ?? 0),
          experienceYears: Math.round(parsed.data.experienceYears),
          updatedAt: new Date(),
        },
      });
    return claimed;
  });
  if (!updated) {
    res.status(403).json({ error: "Role onboarding akun ini sudah ditetapkan." });
    return;
  }
  res.json(SaveMemberOnboardingResponse.parse(updated));
});

router.post("/onboarding/company", requireUser, async (req, res): Promise<void> => {
  const parsed = SaveCompanyOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data perusahaan belum lengkap atau tidak valid." });
    return;
  }

  const user = getAuthenticatedUser(req);
  if (user.role === "member" && user.onboardingComplete) {
    res.status(403).json({ error: "Akun anggota yang sudah onboarding tidak dapat diubah menjadi perusahaan." });
    return;
  }
  if (user.role !== "member" && user.role !== "company") {
    res.status(403).json({ error: "Akun admin tidak memerlukan onboarding perusahaan." });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const companyUserValues = {
      onboardingComplete: true,
      role: "company" as const,
      name: parsed.data.picName,
      email: parsed.data.businessEmail,
      organization: parsed.data.companyName,
      updatedAt: new Date(),
    };
    const [claimed] = user.role === "member"
      ? await tx
          .update(usersTable)
          .set(companyUserValues)
          .where(and(
            eq(usersTable.id, user.id),
            eq(usersTable.role, "member"),
            eq(usersTable.onboardingComplete, false),
          ))
          .returning()
      : await tx
          .update(usersTable)
          .set(companyUserValues)
          .where(and(eq(usersTable.id, user.id), eq(usersTable.role, "company")))
          .returning();
    if (!claimed) return null;
    await tx
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
    return claimed;
  });
  if (!updated) {
    res.status(403).json({ error: "Role onboarding akun ini sudah ditetapkan." });
    return;
  }
  res.json(SaveCompanyOnboardingResponse.parse(updated));
});

export default router;