import { z } from "zod";
import { db } from "../db/drizzleClient";
import { plans } from "../db/schema/plans";
import { sendResponse } from "./userController";
import { asc, desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const planSchema = z.object({
  name: z.string().min(1).max(50),
  apiCallsPerDay: z.number().positive(),
  apiRequestsPerMinute: z.number().positive(),
  dataRangeYears: z.number().nonnegative(),
  price: z.number().nonnegative(),
  currency: z.string().min(1).max(10).default("INR"),
});

export const fetchAllPlans = async (req: any, res: any) => {
try {
    const allPlans = await db.select().from(plans).orderBy(asc(plans.price));
    return sendResponse(res, 200, true, "Plans fetched successfully", allPlans);
  } catch (err) {
    console.error("Error fetching plans:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};

export const fetchPlanById = async (req: any, res: any) => {
  const { id } = req.params;
  if (!id) return sendResponse(res, 400, false, "Plan ID is required");

  try {
    const plan = await db.select().from(plans).where(eq(plans.id, id));
    if (!plan) return sendResponse(res, 404, false, "Plan not found");

    return sendResponse(res, 200, true, "Plan fetched successfully", plan);
  } catch (err) {
    console.error("Error fetching plan:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};

export const createPlan = async (req: any, res: any) => {
  const validation = planSchema.safeParse(req.body);
  if (!validation.success) {
    return sendResponse(
      res,
      400,
      false,
      "Invalid plan data",
      validation.error.errors
    );
  }

  const planData = validation.data;

  try {
    const [newPlan] = await db
      .insert(plans)
      .values({ id: uuid(), ...planData })
      .returning();
    return sendResponse(res, 201, true, "Plan created successfully", newPlan);
  } catch (err) {
    console.error("Error creating plan:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};

export const updatePlan = async (req: any, res: any) => {
  const { id } = req.params;
  if (!id) return sendResponse(res, 400, false, "Plan ID is required");

  const validation = planSchema.partial().safeParse(req.body);
  if (!validation.success) {
    return sendResponse(
      res,
      400,
      false,
      "Invalid plan data",
      validation.error.errors
    );
  }

  const planData = validation.data;

  try {
    const [updatedPlan] = await db
      .update(plans)
      .set(planData)
      .where(eq(plans.id, id))
      .returning();

    if (!updatedPlan) return sendResponse(res, 404, false, "Plan not found");

    return sendResponse(
      res,
      200,
      true,
      "Plan updated successfully",
      updatedPlan
    );
  } catch (err) {
    console.error("Error updating plan:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};

export const deletePlan = async (req: any, res: any) => {
  const { id } = req.params;
  if (!id) return sendResponse(res, 400, false, "Plan ID is required");

  try {
    const result = await db.delete(plans).where(eq(plans.id, id));

    const deletedRows = result.rowCount ?? 0;

    if (!deletedRows || deletedRows === 0)
      return sendResponse(res, 404, false, "Plan not found");

    return sendResponse(res, 200, true, "Plan deleted successfully");
  } catch (err) {
    console.error("Error deleting plan:", err);
    return sendResponse(res, 500, false, "Internal server error");
  }
};
