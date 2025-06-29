import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { v4 as uuid } from "uuid";

export const plans = pgTable("plans", {
  id: text("id")
    .$defaultFn(() => uuid())
    .primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(), //[FREE,BASIC,PRO]
  apiCallsPerDay: integer("api_calls_per_day").notNull(),
  apiRequestsPerMinute: integer("api_requests_per_minute").notNull(),
  dataRangeYears: integer("data_range_years").notNull(),
  price: integer("price").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
