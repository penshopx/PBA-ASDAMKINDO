import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListProgramsQueryParams, ListProgramsResponse } from "@workspace/api-zod";
import { db, enrollmentsTable, programsTable } from "@workspace/db";
import { publicProgramsRateLimit } from "../middlewares/publicRateLimit";

const router: IRouter = Router();

router.get("/programs", publicProgramsRateLimit, async (req, res): Promise<void> => {
  const parsed = ListProgramsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filter program tidak valid." });
    return;
  }

  const filters = [eq(programsTable.status, "published")];
  if (parsed.data.category) filters.push(eq(programsTable.category, parsed.data.category));
  if (parsed.data.mode) filters.push(eq(programsTable.mode, parsed.data.mode));

  const programs = await db
    .select()
    .from(programsTable)
    .where(and(...filters))
    .orderBy(desc(programsTable.createdAt));
  const enrollments = await db.select().from(enrollmentsTable);
  const counts = new Map<string, { enrolled: number; completed: number }>();
  for (const enrollment of enrollments) {
    const current = counts.get(enrollment.programId) ?? { enrolled: 0, completed: 0 };
    if (enrollment.status !== "cancelled") current.enrolled += 1;
    if (enrollment.status === "completed") current.completed += 1;
    counts.set(enrollment.programId, current);
  }
  res.json(
    ListProgramsResponse.parse(
      programs.map((program) => ({
        ...program,
        price: Number(program.price),
        enrolledCount: counts.get(program.id)?.enrolled ?? 0,
        completedCount: counts.get(program.id)?.completed ?? 0,
      })),
    ),
  );
});

export default router;