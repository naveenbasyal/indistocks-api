import express from "express";
import {
  getMyRole,
  loginUser,
  myProfile,
  registerUser,
} from "../controllers/userController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", authMiddleware, myProfile);
router.get("/role", authMiddleware, getMyRole);

export default router;
