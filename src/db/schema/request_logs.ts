import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { v4 as uuid } from "uuid";

export const request_logs = pgTable("request_logs", {
  id: text("id")
    .$defaultFn(() => uuid())
    .primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  createdAt: timestamp("createdAt").notNull().defaultNow(), 
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
