import {
  pgTable,
  text,
  integer,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { subscriptions } from "./subscriptions";
import { plans } from "./plans";
import { v4 as uuid } from "uuid";

export const payments = pgTable("payments", {
  id: text("id")
    .$defaultFn(() => uuid())
    .primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  subscriptionId: text("subscription_id").references(() => subscriptions.id),
  planId: text("plan_id")
    .references(() => plans.id)
    .notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  method: varchar("method", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  transactionId: text("transaction_id").unique(),
  paymentId: text("payment_Id").unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
