import { Router, type IRouter } from "express";
import healthRouter from "./health";
import identityRouter from "./identity";
import programsRouter from "./programs";
import notificationsRouter from "./notifications";
import dashboardsRouter from "./dashboards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(identityRouter);
router.use(programsRouter);
router.use(notificationsRouter);
router.use(dashboardsRouter);

export default router;
