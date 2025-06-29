import {
  pgTable,
  date,
  numeric,
  decimal,
  timestamp,
  foreignKey,
  index,
  text,
} from "drizzle-orm/pg-core";
import { stocks } from "./stocks";
import { v4 as uuid } from "uuid";

export const daily = pgTable(
  "daily",
  {
    id: text("id")
      .$defaultFn(() => uuid())
      .primaryKey(),
    stockId: text("stockid")
      .notNull()
      .references(() => stocks.id),
    date: date("date").notNull(),
    open: decimal("open", { precision: 10, scale: 2 }),
    high: decimal("high", { precision: 10, scale: 2 }),
    low: decimal("low", { precision: 10, scale: 2 }),
    close: decimal("close", { precision: 10, scale: 2 }),
    adjClose: decimal("adjclose", { precision: 10, scale: 2 }),
    volume: numeric("volume", { precision: 20, scale: 0 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    stockDateUnique: index("unique_stock_date")
      .on(table.stockId, table.date),
    stockIdDateIndex: index("idx_daily_stockid_date").on(
      table.stockId,
      table.date
    ),
    dateIndex: index("idx_daily_date").on(table.date),
  })
);
