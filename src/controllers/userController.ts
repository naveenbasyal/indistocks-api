import { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/drizzleClient";
import { users } from "../db/schema/users";
import { plans } from "../db/schema/plans";
import { subscriptions } from "../db/schema/subscriptions";
import { and, eq, sql } from "drizzle-orm";
import { generateToken } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/passwordUtils";

export const sendResponse = (
  res: any,
  status: number,
  success: boolean,
  message: string,
  data?: any
) => {
  return res
    .status(status)
    .json({ success, message, ...(data ? { data } : {}) });
};

export const registerUser = async (req: Request, res: Response) => {
  const { name, email, password, source } = req.body;

  if (!name || !email || !password || !source) {
    return sendResponse(
      res,
      400,
      false,
      "Name, email, password, and source are required"
    );
  }

  try {
    const allowedSources = ["password", "google", "github"];
    if (!allowedSources.includes(source)) {
      return sendResponse(
        res,
        400,
        false,

        `Invalid source`
      );
    }
    await db.transaction(async (trx) => {
      const existingUser = await trx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error("Email already registered");
      }

      // Hash the password
      const hashedPassword = await hashPassword(password);

      // 1) Generate API key and user ID
      const apiKey = uuid();
      const userId = uuid();

      // 2) Insert into users table
      const [newUser] = await trx
        .insert(users)
        .values({
          id: userId,
          name,
          email,
          source,
          password: source === "password" ? hashedPassword : null,
          apiKey: apiKey,
        })
        .returning();
      // 3) Fetch the FREE plan
      const [freePlan] = await trx
        .select()
        .from(plans)
        .where(eq(plans.name, "FREE"));

      if (!freePlan) {
        throw new Error("FREE plan not found in DB");
      }

      // 4) Add a subscription to the FREE plan
      const now = new Date();
      const oneYearFromNow = new Date(now);
      oneYearFromNow.setFullYear(now.getFullYear() + 1);

      await trx.insert(subscriptions).values({
        id: uuid(),
        userId: newUser.id,
        planId: freePlan.id,
        startDate: now.toISOString(),
        endDate: oneYearFromNow.toISOString(),
        isActive: true,
      });

      // 5) Generate JWT token
      const token = generateToken({
        id: newUser.id,
        email: newUser.email,
        plan: freePlan.name,
        role: newUser.role,
      });

      sendResponse(res, 201, true, "User registered", {
        userId: newUser.id,
        apiKey,
        token,
        plan: freePlan.name,
        expiresAt: oneYearFromNow,
      });
    });
  } catch (err: any) {
    console.error("Registration error:", err);

    if (err.message === "Email already registered") {
      return sendResponse(res, 400, false, "Email already registered");
    } else if (err.message === "FREE plan not found in DB") {
      return sendResponse(
        res,
        500,
        false,
        "Plan not found. Please contact support."
      );
    } else {
      return sendResponse(res, 500, false, "Internal server error");
    }
  }
};

export const loginUser = async (req: Request, res: Response) => {
  const { email, password, source } = req.body;

  if (!email || !source) {
    return sendResponse(res, 400, false, "Email and source are required");
  }

  try {
    const allowedSources = ["password", "google", "github"];
    if (!allowedSources.includes(source)) {
      return sendResponse(res, 400, false, `Invalid source`);
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    if (user.source !== source) {
      return sendResponse(res, 400, false, `Source mismatch`);
    }

    if (source === "password") {
      if (!password) {
        return sendResponse(
          res,
          400,
          false,
          "Password is required for password-based login"
        );
      }

      if (typeof user.password !== "string") {
        return sendResponse(res, 401, false, "Invalid password");
      }
      const isPasswordValid = await verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return sendResponse(res, 401, false, "Invalid password");
      }
    }

    if (source !== "password") {
    }
    const userPlan = await db
      .select({
        planName: plans.name,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(eq(users.id, user.id))
      .limit(1);

    const token = generateToken({
      id: user.id,
      email: user.email,
      plan: userPlan[0].planName,
      role: user.role,
    });

    return sendResponse(res, 200, true, "Login successful", {
      token,
      apiKey: user.apiKey,
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return sendResponse(
      res,
      500,
      false,
      err.message || "Internal server error"
    );
  }
};

export const myProfile = async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) {
    return sendResponse(res, 401, false, "Unauthorized");
  }

  try {
    // 1) Fetch user basic details
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        source: users.source,
        apiKey: users.apiKey,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return sendResponse(res, 404, false, "User not found");
    }

    // 2) Fetch their active subscription & plan
    const [sub] = await db
      .select({
        subscriptionId: subscriptions.id,
        planId: subscriptions.planId,
        planName: plans.name,
        apiCallsPerDay: plans.apiCallsPerDay,
        apiRequestsPerMinute: plans.apiRequestsPerMinute,
        dataRangeYears: plans.dataRangeYears,
        price: plans.price,
        currency: plans.currency,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(
        and(eq(subscriptions.userId, userId), eq(subscriptions.isActive, true))
      )
      .limit(1);

    // 3) Build the response
    const profile: any = {
      id: user.id,
      name: user.name,
      email: user.email,
      apiKey: user.apiKey,
    };

    if (sub) {
      profile.activePlan = {
        subscriptionId: sub.subscriptionId,
        planId: sub.planId,
        name: sub.planName,
        price: sub.price,
        currency: sub.currency,
        apiCallsPerDay: sub.apiCallsPerDay,
        apiRequestsPerMinute: sub.apiRequestsPerMinute,
        dataRangeYears: sub.dataRangeYears,
        startDate: sub.startDate,
        endDate: sub.endDate,
      };
    } else {
      profile.activePlan = null;
    }

    return sendResponse(res, 200, true, "User profile fetched", profile);
  } catch (err) {
    console.error("Profile fetch error:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};

export const getMyRole = async (req: any, res: any) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      return sendResponse(res, 401, false, "Authentication required");
    }

    return sendResponse(res, 200, true, "User role retrieved successfully", {
      userId: currentUser.id,
      role: currentUser.role,
    });
  } catch (error) {
    console.error("Error getting user role:", error);
    return sendResponse(res, 500, false, "Failed to retrieve user role", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
