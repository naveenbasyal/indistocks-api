import Razorpay from "razorpay";

import { plans } from "../db/schema/plans";
import { v4 as uuid } from "uuid";
import { db } from "../db/drizzleClient";
import { and, desc, eq, sql } from "drizzle-orm";
import { sendResponse } from "./userController";
import { payments } from "../db/schema/payment";
import { subscriptions } from "../db/schema/subscriptions";
import crypto from "crypto";
import { users } from "../db/schema/users";

const razorpay = new Razorpay({
  key_id: "rzp_test_yQG26LZF4tUxWj",
  key_secret: "vSWs7VlWPYmIxV0eMHa9F62H",
});
const verifyRazorpaySignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean => {
  const secret = "vSWs7VlWPYmIxV0eMHa9F62H";
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
  const generatedSignature = hmac.digest("hex");
  return generatedSignature === razorpaySignature;
};

export const initiatePayment = async (req: any, res: any) => {
  const userId = req.user.id;
  const { planId } = req.body;

  console.log("[initiatePayment] Received request to initiate payment.");
  console.log(`[initiatePayment] userId: ${userId}, planId: ${planId}`);

  if (!planId || !userId) {
    console.warn("[initiatePayment] Missing planId or userId in request.");
    return res.status(400).json({
      success: false,
      message: "Plan ID and User ID are required",
    });
  }

  try {
    let plan: any = null;
    let paymentOptions: any = null;
    let order: any = null;

    await db.transaction(async (trx) => {
      console.log(
        `[initiatePayment] Fetching plan details for planId: ${planId}`
      );
      const planResult = await trx
        .select()
        .from(plans)
        .where(eq(plans.id, planId))
        .limit(1);

      if (planResult.length === 0) {
        console.warn(`[initiatePayment] No plan found for planId: ${planId}`);
        throw new Error("Plan not found");
      }

      plan = planResult;
      console.log("plan:", plan);

      paymentOptions = {
        amount: plan[0].price * 100,
        currency: "INR",
        receipt: `rcpt_${uuid().substring(0, 30)}`,
        notes: {
          userId,
          planId,
        },
      };

      console.log(
        "[initiatePayment] Creating Razorpay order with options:",
        paymentOptions
      );
      order = await razorpay.orders.create(paymentOptions);

      console.log(
        `[initiatePayment] Razorpay order created. Order ID: ${order}`
      );

      await trx.insert(payments).values({
        id: uuid(),
        userId,
        planId,
        amount: plan[0].price,
        currency: "INR",
        method: "razorpay",
        status: "pending",
        transactionId: order.id,
        subscriptionId: null,
      });

      console.log(
        `[initiatePayment] Payment record inserted for userId: ${userId}, planId: ${planId}, orderId: ${order.id}`
      );
    });

    sendResponse(res, 200, true, "Payment initiated successfully", {
      order,
      paymentOptions,
      amountInRupee: plan[0].price,
      amountInPaise: plan[0].price * 100,
    });
  } catch (error: any) {
    console.error("[initiatePayment] Error initiating payment:", error.message);
    sendResponse(res, 500, false, error.message || "Internal server error");
  }
};
export const handlePaymentSuccess = async (req: any, res: any) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  console.log("\n[handlePaymentSuccess] Received payment success callback.");
  console.log(`[handlePaymentSuccess] razorpayOrderId: ${razorpayOrderId}`);
  console.log(`[handlePaymentSuccess] razorpayPaymentId: ${razorpayPaymentId}`);
  console.log(
    `[handlePaymentSuccess] razorpaySignature: ${razorpaySignature}\n`
  );

  if (![razorpayOrderId, razorpayPaymentId, razorpaySignature].every(Boolean)) {
    console.warn(
      "[handlePaymentSuccess] Missing required fields in request body."
    );
    return sendResponse(
      res,
      400,
      false,
      "Order ID, Payment ID, and Signature are required"
    );
  }

  console.log("[handlePaymentSuccess] Verifying Razorpay signature...");
  if (
    !verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    )
  ) {
    console.warn("[handlePaymentSuccess] Invalid Razorpay signature.");
    return sendResponse(res, 400, false, "Invalid signature");
  }
  console.log(
    "[handlePaymentSuccess] Razorpay signature verified successfully.\n"
  );

  try {
    console.log(
      `[handlePaymentSuccess] Fetching payment from Razorpay for paymentId: ${razorpayPaymentId}`
    );
    const razorpayPayment = await razorpay.payments.fetch(razorpayPaymentId);
    console.log(
      "[handlePaymentSuccess] Razorpay payment fetched:",
      JSON.stringify(razorpayPayment, null, 2)
    );

    if (
      razorpayPayment.order_id !== razorpayOrderId ||
      razorpayPayment.status !== "captured"
    ) {
      console.warn(
        `[handlePaymentSuccess] Payment not successful or order mismatch. order_id: ${razorpayPayment.order_id}, expected: ${razorpayOrderId}, status: ${razorpayPayment.status}`
      );
      return sendResponse(
        res,
        400,
        false,
        `Payment not successfull or order mismatch (status=${razorpayPayment.status})`
      );
    }

    console.log(
      `[handlePaymentSuccess] Fetching local payment record for transactionId: ${razorpayOrderId}`
    );
    const [dbPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, razorpayOrderId))
      .limit(1);

    if (!dbPayment) {
      console.warn(
        `[handlePaymentSuccess] Local payment record not found for transactionId: ${razorpayOrderId}`
      );
      return sendResponse(res, 404, false, "Local payment record not found");
    }
    if (dbPayment.status === "completed") {
      return sendResponse(res, 200, true, "Payment already processed");
    }
    console.log(
      "[handlePaymentSuccess] Local payment record found:",
      JSON.stringify(dbPayment, null, 2)
    );

    await db.transaction(async (trx) => {
      console.log(
        `[handlePaymentSuccess] Deactivating existing active subscriptions for userId: ${dbPayment.userId}`
      );
      await trx
        .update(subscriptions)
        .set({ isActive: false })
        .where(
          and(
            eq(subscriptions.userId, dbPayment.userId),
            eq(subscriptions.isActive, true)
          )
        );

      // Create the new subscription
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      console.log(
        `[handlePaymentSuccess] Creating new subscription for userId: ${dbPayment.userId}, planId: ${dbPayment.planId}`
      );
      const [newSub] = await trx
        .insert(subscriptions)
        .values({
          id: uuid(),
          userId: dbPayment.userId,
          planId: dbPayment.planId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          isActive: true,
        })
        .returning();

      console.log(
        "[handlePaymentSuccess] New subscription created:",
        JSON.stringify(newSub, null, 2)
      );

      // Mark our payment as completed and link to the new subscription
      console.log(
        `[handlePaymentSuccess] Updating payment status to 'completed' and linking to subscriptionId: ${newSub.id}`
      );
      await trx
        .update(payments)
        .set({
          status: "completed",
          subscriptionId: newSub.id,
          paymentId: razorpayPaymentId,
        })
        .where(eq(payments.transactionId, razorpayOrderId));
    });

    console.log(
      "[handlePaymentSuccess] Payment and subscription update successful.\n"
    );
    // 7) Return success
    return sendResponse(
      res,
      200,
      true,
      "Payment verified and subscription updated",
      {
        subscriptionId: dbPayment.subscriptionId,
        userId: dbPayment.userId,
        planId: dbPayment.planId,
        amount: dbPayment.amount,
        currency: dbPayment.currency,
        razorpayPayment,
      }
    );
  } catch (err: any) {
    console.error("[handlePaymentSuccess] Error:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};
export const getAllPayments = async (req: any, res: any) => {
  try {
    console.log("[getAllPayments] Fetching all payments with details");

    const allPayments = await db
      .select({
        payment: payments,
        user: {
          name: users.name,
          email: users.email,
        },
        plan: {
          name: plans.name,
          price: plans.price,
        },
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .leftJoin(plans, eq(payments.planId, plans.id))
      .orderBy(desc(payments.createdAt));

    // Calculate insights
    const [stats] = await db
      .select({
        totalRevenue: sql<number>`sum(case when ${payments.status} = 'completed' then ${payments.amount} else 0 end)`,
        completedPayments: sql<number>`count(case when ${payments.status} = 'completed' then 1 end)`,
        pendingPayments: sql<number>`count(case when ${payments.status} = 'pending' then 1 end)`,
        failedPayments: sql<number>`count(case when ${payments.status} = 'failed' then 1 end)`,
        avgPaymentAmount: sql<number>`avg(case when ${payments.status} = 'completed' then ${payments.amount} end)`,
      })
      .from(payments);

    // Get plan-wise revenue
    const planRevenue = await db
      .select({
        planName: plans.name,
        totalRevenue: sql<number>`sum(${payments.amount})`,
        totalSales: sql<number>`count(*)`,
      })
      .from(payments)
      .leftJoin(plans, eq(payments.planId, plans.id))
      .where(eq(payments.status, "completed"))
      .groupBy(plans.name);

    const cleanPayments = allPayments.map((item) => ({
      paymentId: item.payment.paymentId || "N/A",
      transactionId: item.payment.transactionId,
      customerName: item.user?.name ?? "N/A",
      customerEmail: item.user?.email ?? "N/A",
      planName: item.plan?.name ?? "N/A",
      amount: `₹${item.payment.amount}`,
      status: item.payment.status.toUpperCase(),
      paymentMethod: item.payment.method.toUpperCase(),
      paymentDate: new Date(item.payment.createdAt).toLocaleDateString(
        "en-IN",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      ),
    }));

    sendResponse(res, 200, true, "Payment overview fetched successfully", {
      overview: {
        totalRevenue: `₹${stats.totalRevenue || 0}`,
        totalPayments: allPayments.length,
        completedPayments: stats.completedPayments || 0,
        pendingPayments: stats.pendingPayments || 0,
        failedPayments: stats.failedPayments || 0,
        averagePayment: `₹${Math.round(stats.avgPaymentAmount || 0)}`,
      },
      planWiseRevenue: planRevenue.map((plan) => ({
        planName: plan.planName,
        revenue: `₹${plan.totalRevenue}`,
        totalSales: plan.totalSales,
      })),
      recentPayments: cleanPayments,
    });
  } catch (error: any) {
    console.error("[getAllPayments] Error:", error.message);
    sendResponse(res, 500, false, error.message || "Internal server error");
  }
};
