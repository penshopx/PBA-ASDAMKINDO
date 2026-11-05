import { Router } from "express";
import {
  AcknowledgeAdminAlertParams, AcknowledgeAdminAlertResponse,
  ListAdminAlertResponsesResponse,
} from "@workspace/api-zod";
import { getAuthenticatedUser, requireRole, requireUser } from "../lib/auth";
import { acknowledgeAlertResponse, listAlertResponses } from "../lib/alert-responses";

const router = Router();
const adminOnly = [requireUser, requireRole("admin", "super_admin")];

router.get("/admin/observability/responses", ...adminOnly, async (_req, res) => {
  res.json(ListAdminAlertResponsesResponse.parse(await listAlertResponses()));
});

router.post("/admin/observability/responses/:id/ack", ...adminOnly, async (req, res) => {
  const params = AcknowledgeAdminAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID alarm tidak valid." });
    return;
  }
  const result = await acknowledgeAlertResponse(params.data.id, getAuthenticatedUser(req).id);
  if (!result) {
    res.status(404).json({ error: "Alarm tidak ditemukan." });
    return;
  }
  res.json(AcknowledgeAdminAlertResponse.parse(result));
});

export default router;
