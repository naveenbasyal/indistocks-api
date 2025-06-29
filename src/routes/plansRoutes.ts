import express from "express";

import {
  createPlan,
  deletePlan,
  fetchAllPlans,
  fetchPlanById,
  updatePlan,
} from "../controllers/plansController";
import { authMiddleware, requiresStaffMember } from "../middlewares/authMiddleware";

const router = express.Router();

router.get("/", fetchAllPlans);
router.get("/:id", fetchPlanById);
router.post("/", authMiddleware, requiresStaffMember, createPlan);
router.put("/:id", authMiddleware, requiresStaffMember, updatePlan);
router.delete("/:id", authMiddleware, requiresStaffMember, deletePlan);

export default router;
