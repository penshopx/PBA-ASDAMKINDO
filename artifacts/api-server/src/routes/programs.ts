import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ListProgramsQueryParams, ListProgramsResponse } from "@workspace/api-zod";
import { db, programsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/programs", async (req, res): Promise<void> => {
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
    .orderBy(programsTable.createdAt);
  res.json(
    ListProgramsResponse.parse(
      programs.map((program) => ({ ...program, price: Number(program.price) })),
    ),
  );
});

export default router;