import { Router } from "express";
import { authenticate } from "../auth/auth.middleware";
import { lifecycle, listUsers, patchUser, showUser } from "./admin-users.controller";
import { requireAdminDashboardAccess } from "./admin-users.middleware";

const router = Router();
router.use(authenticate, requireAdminDashboardAccess);
router.get("/users", listUsers);
router.get("/users/:userId", showUser);
router.patch("/users/:userId", patchUser);
router.post("/users/:userId/deactivate", lifecycle("deactivate"));
router.post("/users/:userId/reactivate", lifecycle("reactivate"));
router.post("/users/:userId/delete", lifecycle("delete"));
router.post("/users/:userId/restore", lifecycle("restore"));

export default router;
