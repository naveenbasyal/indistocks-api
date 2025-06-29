import express from "express";

import {
  getAllPayments,
  handlePaymentSuccess,
  initiatePayment,
} from "../controllers/paymentsContoller";
import { requiresStaffMember } from "../middlewares/authMiddleware";

const router = express.Router();

router.post("/initiate-payment", initiatePayment);
router.post("/success", handlePaymentSuccess);
router.get("/", requiresStaffMember, getAllPayments);

export default router;
