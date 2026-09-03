import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import {
  runSyntheticChecks,
} from "../lib/observability";

const router: IRouter = Router();

router.get("/healthz", async (req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Health check database query failed");
    res.status(503).json({ error: "Layanan sementara tidak tersedia." });
  }
});

router.get("/readyz", async (_req, res): Promise<void> => {
  const result = await runSyntheticChecks();
  res.status(result.status === "ok" ? 200 : 503).json(result);
});

export default router;
