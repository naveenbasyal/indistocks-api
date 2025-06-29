import { pgTable, text, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { users } from "./users";
import { plans } from "./plans";
import { v4 as uuid } from "uuid";

export const subscriptions = pgTable("subscriptions", {
  id: text("id")
    .$defaultFn(() => uuid())
    .primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  planId: text("plan_id")
    .references(() => plans.id)
    .notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
