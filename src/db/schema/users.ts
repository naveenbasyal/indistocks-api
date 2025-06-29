import {
  pgTable,
  varchar,
  timestamp,
  text,
  boolean,
} from "drizzle-orm/pg-core";

import { v4 as uuid } from "uuid";

export const users = pgTable("users", {
  id: text("id")
    .$defaultFn(() => uuid())
    .primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  password: varchar("password", { length: 255 }),
  source: varchar("source", { length: 50 }).default("password"),
  apiKey: varchar("api_key", { length: 255 }).unique(),
  emailVerified: boolean("email_verified").default(false),
  role: varchar("role", { length: 50 }).default("user"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
