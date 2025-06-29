import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  index,
  text,
} from "drizzle-orm/pg-core";
import { v4 as uuid } from "uuid";

export const stocks = pgTable(
  "stocks",
  {
    id: text("id")
      .$defaultFn(() => uuid())
      .primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    symbol: varchar("symbol", { length: 200 }).notNull().unique(),
    customSymbol: varchar("customsymbol", { length: 200 }),
    scriptType: varchar("scripttype", { length: 100 }),
    industry: varchar("industry", { length: 100 }),
    isin: varchar("isin", { length: 100 }),
    fno: boolean("fno").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    symbolIndex: index("idx_stocks_symbol").on(table.symbol),
  })
);
