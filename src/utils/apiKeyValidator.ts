import { db } from "../db/drizzleClient";
import { users } from "../db/schema/users";
import { subscriptions } from "../db/schema/subscriptions";
import { plans } from "../db/schema/plans";
import { request_logs } from "../db/schema/request_logs";
import { eq, and, gte } from "drizzle-orm";

export const validateApiKey = async (req: any, res: any, next: any) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res
      .status(401)
      .json({ success: false, message: "API key is required" });
  }

  try {
    // Fetch the user by API key

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.apiKey, apiKey));

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid API key" });
    }

    // Check active subscription
    const now = new Date();
    const [subscription] = await db
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        isActive: subscriptions.isActive,
        planName: plans.name,
        apiCallsPerDay: plans.apiCallsPerDay,
        apiRequestsPerMinute: plans.apiRequestsPerMinute,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(
        and(
          eq(subscriptions.userId, user.id),
          eq(subscriptions.isActive, true),
          gte(subscriptions.endDate, now.toISOString())
        )
      );

    if (!subscription) {
      return res
        .status(403)
        .json({ success: false, message: "No active subscription found" });
    }

    // Check daily and per-minute limits
    const today = new Date().toISOString().split("T")[0];
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    // Daily requests

    const dailyRequests = await db
      .select()
      .from(request_logs)
      .where(
        and(
          eq(request_logs.userId, user.id),
          gte(request_logs.timestamp, new Date(`${today}T00:00:00.000Z`))
        )
      );
    console.log(
      `🔢 [API Key Validator] ---> Daily requests made: ${dailyRequests.length}/${subscription.apiCallsPerDay}`
    );
    if (dailyRequests.length >= subscription.apiCallsPerDay) {
      console.log("🚫 [API Key Validator] ---> Daily API call limit exceeded.");
      return res
        .status(429)
        .json({ success: false, message: "Daily API call limit exceeded" });
    }

    // Per-minute requests
    const recentRequests = await db
      .select()
      .from(request_logs)
      .where(
        and(
          eq(request_logs.userId, user.id),
          gte(request_logs.timestamp, oneMinuteAgo)
        )
      );
    console.log(
      `🔢 [API Key Validator] ---> Per-minute requests made: ${recentRequests.length}/${subscription.apiRequestsPerMinute}`
    );
    if (recentRequests.length >= subscription.apiRequestsPerMinute) {
      console.log(
        "🚫 [API Key Validator] ---> Per-minute API call limit exceeded."
      );
      return res.status(429).set("Retry-After", 60).json({
        success: false,
        message: "Per-minute API call limit exceeded",
      });
    }

    // Log the request
    console.log("📝 [API Key Validator] ---> Logging the request...");
    await db.insert(request_logs).values({
      userId: user.id,
      endpoint: req.originalUrl,
      method: req.method,
      timestamp: new Date(),
      statusCode: 200,
    });

    // Attach user and subscription info to the request
    req.user = user;
    req.subscription = subscription;

    console.log(
      "✅ [API Key Validator] ---> Validation successful. Proceeding to next middleware."
    );
    next();
  } catch (err) {
    console.error("🔥 [API Key Validator] ---> API key validation error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
