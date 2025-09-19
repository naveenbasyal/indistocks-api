import { db } from "../db/drizzleClient";
import { users } from "../db/schema/users";
import { subscriptions } from "../db/schema/subscriptions";
import { plans } from "../db/schema/plans";

import { eq, and, gte, lte } from "drizzle-orm";
import redis from "./redisClient";

export const validateApiKeyRedis = async (req: any, res: any, next: any) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res
      .status(401)
      .json({ success: false, message: "API key is required" });
  }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.apiKey, apiKey));
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid API key" });
    }

    await refreshUserSubscriptions(user.id);

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

    const dailyKey = `rate:${user.id}:daily`;
    const minuteKey = `rate:${user.id}:minute`;

    const [dailyCount, minuteCount] = await Promise.all([
      redis.incr(dailyKey),
      redis.incr(minuteKey),
    ]);

    console.log("daily count-->", dailyCount);
    console.log("minute count-->", minuteCount);
    const ttlPromises = [];
    if (dailyCount === 1) ttlPromises.push(redis.expire(dailyKey, 86400));
    if (minuteCount === 1) ttlPromises.push(redis.expire(minuteKey, 60));

    await Promise.all(ttlPromises);

    if (dailyCount > subscription.apiCallsPerDay) {
      return res.status(429).set("Retry-After", 86400).json({
        success: false,
        message: "Daily API call limit exceeded",
      });
    }

    if (minuteCount > subscription.apiRequestsPerMinute) {
      return res.status(429).set("Retry-After", 60).json({
        success: false,
        message: "Per-minute API call limit exceeded",
      });
    }

    req.user = user;
    req.subscription = subscription;

    next();
  } catch (err) {
    console.error("🔥 [API Key Validator] ---> Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

async function refreshUserSubscriptions(userId: string) {
  const now = new Date().toISOString();

  // Expire old subscriptions
  await db
    .update(subscriptions)
    .set({ isActive: false })
    .where(
      and(
        eq(subscriptions.userId, userId),
        lte(subscriptions.endDate, now),
        eq(subscriptions.isActive, true)
      )
    );

  // Check if user has another valid plan
  const [latestSub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), gte(subscriptions.endDate, now))
    )
    .orderBy(subscriptions.endDate)
    .limit(1);

  if (latestSub) {
    await db
      .update(subscriptions)
      .set({ isActive: true })
      .where(eq(subscriptions.id, latestSub.id));
  }
}
