import pool from "../db/dbClient";

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface SubscriptionInfo {
  dataRangeYears: number;
  maxAllowedStartDate: Date;
}

export class ValidationHelper {
  static validatePagination(
    page: any,
    limit: any,
    maxLimit = 500
  ): PaginationParams {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    console.log("limitNum", limitNum);
    console.log("limitNum", maxLimit);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum <= 0 || limitNum <= 0) {
      throw new Error("Invalid pagination parameters");
    }

    if (limitNum > maxLimit) {
      throw new Error(`Limit cannot exceed ${maxLimit}`);
    }

    return {
      page: pageNum,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    };
  }

  static validateSymbol(symbol: any): string {
    if (!symbol || typeof symbol !== "string" || symbol.trim() === "") {
      throw new Error("A valid symbol parameter is required");
    }
    return symbol.toUpperCase();
  }

  static validatePeriod(period: any): number {
    const periodNum = parseInt(period);
    if (isNaN(periodNum) || periodNum <= 0) {
      throw new Error("Period must be a positive number");
    }
    return periodNum;
  }

  static validateDateRange(
    startDate?: string,
    endDate?: string
  ): Partial<DateRange> {
    const result: Partial<DateRange> = {};

    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        throw new Error("Invalid start date format");
      }
      result.startDate = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        throw new Error("Invalid end date format");
      }
      result.endDate = end;
    }

    return result;
  }
}

export class StockService {
  static async getSubscriptionInfo(userId: number): Promise<SubscriptionInfo> {
    const query = `
      SELECT p.data_range_years 
      FROM subscriptions s
      INNER JOIN plans p ON s.plan_id = p.id
      WHERE s.user_id = $1 AND s.is_active = true
      LIMIT 1;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      throw new Error("No active subscription found");
    }

    const dataRangeYears = result.rows[0].data_range_years;
    const maxAllowedStartDate = new Date();
    maxAllowedStartDate.setFullYear(
      maxAllowedStartDate.getFullYear() - dataRangeYears
    );

    return {
      dataRangeYears,
      maxAllowedStartDate,
    };
  }

  static async getStockId(symbol: string): Promise<number> {
    const result = await pool.query("SELECT id FROM stocks WHERE symbol = $1", [
      symbol,
    ]);

    if (result.rows.length === 0) {
      throw new Error("Stock not found");
    }

    return result.rows[0].id;
  }

  static adjustDateRange(
    userStartDate: Date | undefined,
    userEndDate: Date | undefined,
    subscriptionInfo: SubscriptionInfo
  ): DateRange {
    const currentDate = new Date();
    const { maxAllowedStartDate } = subscriptionInfo;

    const startDate = userStartDate || maxAllowedStartDate;
    const endDate = userEndDate || currentDate;

    return {
      startDate:
        startDate < maxAllowedStartDate ? maxAllowedStartDate : startDate,
      endDate: endDate > currentDate ? currentDate : endDate,
    };
  }

  static async getAllStocks(pagination: PaginationParams) {
    const { limit, offset } = pagination;

    const [dataResult, countResult] = await Promise.all([
      pool.query("SELECT * FROM stocks LIMIT $1 OFFSET $2", [limit, offset]),
      pool.query("SELECT COUNT(*) FROM stocks"),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  static async getStockBySymbol(symbol: string) {
    const result = await pool.query("SELECT * FROM stocks WHERE symbol = $1", [
      symbol,
    ]);

    if (result.rows.length === 0) {
      throw new Error("Stock not found");
    }

    return result.rows[0];
  }

  static async getDailyData(
    stockId: number,
    dateRange: DateRange,
    pagination: PaginationParams
  ) {
    const { startDate, endDate } = dateRange;
    const { limit, offset } = pagination;

    const dataQuery = `
      SELECT * FROM daily
      WHERE stockId = $1 AND date >= $2 AND date <= $3
      ORDER BY date DESC
      LIMIT $4 OFFSET $5
    `;

    const countQuery = `
      SELECT COUNT(*) FROM daily
      WHERE stockId = $1 AND date >= $2 AND date <= $3
    `;

    const params = [stockId, startDate.toISOString(), endDate.toISOString()];

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...params, limit, offset]),
      pool.query(countQuery, params),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  static async searchStocks(
    query?: string,
    isFoEligible?: boolean,
    pagination?: PaginationParams
  ) {
    const conditions: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (query?.trim()) {
      conditions.push(
        `(s.name ILIKE $${index} OR s.symbol ILIKE $${index} OR s.industry ILIKE $${index} OR s.isin ILIKE $${index})`
      );
      values.push(`%${query.trim()}%`);
      index++;
    }

    if (isFoEligible !== undefined) {
      conditions.push(`s.fno = $${index}`);
      values.push(isFoEligible);
      index++;
    }

    const searchQuery = `
    SELECT 
      s.id, s.name, s.symbol, s.customsymbol, s.scripttype, 
      s.industry, s.isin, s.fno, s.created_at, s.updated_at,
      d.date AS latest_date, d.open, d.high, d.low, d.close, d.volume,
      -- Calculate Day Range
      (SELECT MIN(low) FROM daily WHERE date = CURRENT_DATE AND stockid = s.id) AS day_low,
      (SELECT MAX(high) FROM daily WHERE date = CURRENT_DATE AND stockid = s.id) AS day_high,
      -- Calculate 52-Week Range
      (SELECT MIN(low) FROM daily WHERE date >= CURRENT_DATE - INTERVAL '1 year' AND stockid = s.id) AS week_52_low,
      (SELECT MAX(high) FROM daily WHERE date >= CURRENT_DATE - INTERVAL '1 year' AND stockid = s.id) AS week_52_high
    FROM stocks s
    LEFT JOIN LATERAL (
      SELECT date, open, high, low, close, volume
      FROM daily 
      WHERE stockid = s.id 
      ORDER BY date DESC 
      LIMIT 1
    ) d ON true
    ${conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : ""}
    ORDER BY s.name ASC
    ${pagination ? `LIMIT $${index} OFFSET $${index + 1}` : ""}
  `;

    if (pagination) {
      values.push(pagination.limit, pagination.offset);
    }

    const result = await pool.query(searchQuery, values);

    return result.rows;
  }

  static async getHistoricalPrices(
    stockId: number,
    dateRange: DateRange,
    columns: string[] = ["date", "close"]
  ) {
    const { startDate, endDate } = dateRange;

    const query = `
      SELECT ${columns.join(", ")}
      FROM daily
      WHERE stockId = $1 AND date >= $2 AND date <= $3
      ORDER BY date ASC
    `;

    const result = await pool.query(query, [
      stockId,
      startDate.toISOString(),
      endDate.toISOString(),
    ]);

    return result.rows;
  }
}

export class TechnicalAnalysis {
  static calculateSMA(prices: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = 0; i <= prices.length - period; i++) {
      const sum = prices.slice(i, i + period).reduce((a, b) => a + b, 0);
      sma.push(parseFloat((sum / period).toFixed(2)));
    }
    return sma;
  }

  static calculateEMA(prices: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    let prevEma = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    ema.push(parseFloat(prevEma.toFixed(2)));
    for (let i = period; i < prices.length; i++) {
      const currentEma = (prices[i] - prevEma) * multiplier + prevEma;
      ema.push(parseFloat(currentEma.toFixed(2)));
      prevEma = currentEma;
    }
    return ema;
  }

  static calculateRSI(prices: number[], period: number): number[] {
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi.push(parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)));

    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
      const rs = avgGain / avgLoss;
      rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
    }

    return rsi;
  }
}
