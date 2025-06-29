import { Request, Response } from "express";
import pool from "../db/dbClient";
import { sendResponse } from "../utils/stockResponseHelpers";
import { PaginationParams, StockService, TechnicalAnalysis, ValidationHelper } from "../services/StockService";

export const getAllStocks = async (req: Request, res: Response) => {
  try {
    const pagination = ValidationHelper.validatePagination(
      req.query.page,
      req.query.limit,
      100
    );
    const result = await StockService.getAllStocks(pagination);

    return sendResponse(
      res,
      200,
      true,
      "Stocks retrieved successfully",
      result.data,
      {
        page: pagination.page,
        limit: pagination.limit,
        total: result.total,
      }
    );
  } catch (error: any) {
    console.error("Error fetching stocks:", error);
    return sendResponse(
      res,
      error.message.includes("Invalid") ? 400 : 500,
      false,
      error.message || "Failed to retrieve stocks"
    );
  }
};

export const getStockBySymbol = async (req: Request, res: Response) => {
  try {
    const symbol = ValidationHelper.validateSymbol(req.params.symbol);
    const stock = await StockService.getStockBySymbol(symbol);

    return sendResponse(res, 200, true, "Stock retrieved successfully", stock);
  } catch (error: any) {
    console.error("Error fetching stock:", error);
    const statusCode =
      error.message === "Stock not found"
        ? 404
        : error.message.includes("valid symbol")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to retrieve stock"
    );
  }
};

export const getDailyData = async (req: any, res: any) => {
  try {
    const symbol = ValidationHelper.validateSymbol(req.params.symbol);
    const pagination = ValidationHelper.validatePagination(
      req.query.page,
      req.query.limit,
      500
    );
    const dateParams = ValidationHelper.validateDateRange(
      req.query.startDate as string,
      req.query.endDate as string
    );

    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, false, "User authentication required");
    }

    const [subscriptionInfo, stockId] = await Promise.all([
      StockService.getSubscriptionInfo(userId),
      StockService.getStockId(symbol),
    ]);

    const dateRange = StockService.adjustDateRange(
      dateParams.startDate,
      dateParams.endDate,
      subscriptionInfo
    );

    const result = await StockService.getDailyData(
      stockId,
      dateRange,
      pagination
    );

    return sendResponse(
      res,
      200,
      true,
      "Daily data retrieved successfully",
      result.data,
      {
        page: pagination.page,
        limit: pagination.limit,
        total: result.total,
      }
    );
  } catch (error: any) {
    console.error("Error fetching daily data:", error);
    const statusCode =
      error.message === "No active subscription found"
        ? 403
        : error.message === "Stock not found"
        ? 404
        : error.message.includes("Invalid") || error.message.includes("valid")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to retrieve daily data"
    );
  }
};

export const searchStocks = async (req: Request, res: Response) => {
  try {
    const { query, isFoEligible } = req.query;
    let pagination: PaginationParams | undefined;

    if (query && (typeof query !== "string" || query.trim().length === 0)) {
      return sendResponse(
        res,
        400,
        false,
        "Query parameter must be a non-empty string"
      );
    }

    if (req.query.page || req.query.limit) {
      pagination = ValidationHelper.validatePagination(
        req.query.page,
        req.query.limit,
        100
      );
    }

    const isFoEligibleBool =
      isFoEligible === "true"
        ? true
        : isFoEligible === "false"
        ? false
        : undefined;

    const stocks = await StockService.searchStocks(
      query as string,
      isFoEligibleBool,
      pagination
    );

    if (stocks.length === 0) {
      return sendResponse(
        res,
        404,
        false,
        "No stocks found matching the criteria"
      );
    }

    const responseData = pagination
      ? {
          stocks,
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            hasMore: stocks.length === pagination.limit,
          },
        }
      : { stocks };

    return sendResponse(
      res,
      200,
      true,
      `Found ${stocks.length} stocks matching your criteria`,
      responseData
    );
  } catch (error: any) {
    console.error("Error searching stocks:", error);
    const statusCode =
      error.message.includes("Invalid") || error.message.includes("must be")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to search stocks"
    );
  }
};

export const getStockPerformance = async (req: any, res: any) => {
  try {
    const symbol = ValidationHelper.validateSymbol(req.params.symbol);
    const pagination = ValidationHelper.validatePagination(
      req.query.page,
      req.query.limit,
      500
    );
    const dateParams = ValidationHelper.validateDateRange(
      req.query.startDate as string,
      req.query.endDate as string
    );

    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, false, "User authentication required");
    }

    const [subscriptionInfo, stockId] = await Promise.all([
      StockService.getSubscriptionInfo(userId),
      StockService.getStockId(symbol),
    ]);

    const dateRange = StockService.adjustDateRange(
      dateParams.startDate,
      dateParams.endDate,
      subscriptionInfo
    );

    const performanceQuery = `
      SELECT date, open, close, 
        ROUND(((close - open) / open) * 100, 2) AS percentage_change
      FROM daily
      WHERE stockId = $1 AND date >= $2 AND date <= $3
      ORDER BY date DESC
      LIMIT $4 OFFSET $5
    `;

    const countQuery = `
      SELECT COUNT(*) FROM daily
      WHERE stockId = $1 AND date >= $2 AND date <= $3
    `;

    const params = [
      stockId,
      dateRange.startDate.toISOString(),
      dateRange.endDate.toISOString(),
    ];

    const [performanceResult, countResult] = await Promise.all([
      pool.query(performanceQuery, [
        ...params,
        pagination.limit,
        pagination.offset,
      ]),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return sendResponse(
      res,
      200,
      true,
      "Stock performance retrieved successfully",
      performanceResult.rows,
      { page: pagination.page, limit: pagination.limit, total }
    );
  } catch (error: any) {
    console.error("Error fetching stock performance:", error);
    const statusCode =
      error.message === "No active subscription found"
        ? 403
        : error.message === "Stock not found"
        ? 404
        : error.message.includes("Invalid") || error.message.includes("valid")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to retrieve stock performance"
    );
  }
};

export const getMovingAverages = async (req: any, res: any) => {
  try {
    const symbol = ValidationHelper.validateSymbol(req.params.symbol);
    const period = ValidationHelper.validatePeriod(req.query.period || 20);
    const dateParams = ValidationHelper.validateDateRange(
      req.query.startDate as string,
      req.query.endDate as string
    );

    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, false, "User authentication required");
    }

    const [subscriptionInfo, stockId] = await Promise.all([
      StockService.getSubscriptionInfo(userId),
      StockService.getStockId(symbol),
    ]);

    const dateRange = StockService.adjustDateRange(
      dateParams.startDate,
      dateParams.endDate,
      subscriptionInfo
    );

    const historicalData = await StockService.getHistoricalPrices(
      stockId,
      dateRange
    );

    if (historicalData.length === 0) {
      return sendResponse(
        res,
        404,
        false,
        "No historical data found for the specified range"
      );
    }

    const prices = historicalData.map((row: any) => parseFloat(row.close));
    const sma = TechnicalAnalysis.calculateSMA(prices, period);
    const ema = TechnicalAnalysis.calculateEMA(prices, period);

    return sendResponse(
      res,
      200,
      true,
      `Moving averages for ${symbol} calculated successfully`,
      {
        sma,
        ema,
        period,
        dateRange: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching moving averages:", error);
    const statusCode =
      error.message === "No active subscription found"
        ? 403
        : error.message === "Stock not found"
        ? 404
        : error.message.includes("Invalid") ||
          error.message.includes("valid") ||
          error.message.includes("must be")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to calculate moving averages"
    );
  }
};

export const getRSI = async (req: any, res: any) => {
  try {
    const symbol = ValidationHelper.validateSymbol(req.params.symbol);
    const period = ValidationHelper.validatePeriod(req.query.period || 14);
    const dateParams = ValidationHelper.validateDateRange(
      req.query.startDate as string,
      req.query.endDate as string
    );

    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, false, "User authentication required");
    }

    const [subscriptionInfo, stockId] = await Promise.all([
      StockService.getSubscriptionInfo(userId),
      StockService.getStockId(symbol),
    ]);

    const dateRange = StockService.adjustDateRange(
      dateParams.startDate,
      dateParams.endDate,
      subscriptionInfo
    );

    const historicalData = await StockService.getHistoricalPrices(
      stockId,
      dateRange
    );

    if (historicalData.length === 0) {
      return sendResponse(
        res,
        404,
        false,
        "No historical data found for the specified range"
      );
    }

    const prices = historicalData.map((row: any) => parseFloat(row.close));
    const rsi = TechnicalAnalysis.calculateRSI(prices, period);

    return sendResponse(
      res,
      200,
      true,
      `RSI for ${symbol} calculated successfully`,
      {
        rsi,
        period,
        dateRange: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching RSI:", error);
    const statusCode =
      error.message === "No active subscription found"
        ? 403
        : error.message === "Stock not found"
        ? 404
        : error.message.includes("Invalid") ||
          error.message.includes("valid") ||
          error.message.includes("must be")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to calculate RSI"
    );
  }
};

export const downloadHistoricalData = async (req: any, res: any) => {
  try {
    const symbol = ValidationHelper.validateSymbol(req.params.symbol);
    const dateParams = ValidationHelper.validateDateRange(
      req.query.startDate as string,
      req.query.endDate as string
    );

    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, false, "User authentication required");
    }

    const [subscriptionInfo, stockId] = await Promise.all([
      StockService.getSubscriptionInfo(userId),
      StockService.getStockId(symbol),
    ]);

    const dateRange = StockService.adjustDateRange(
      dateParams.startDate,
      dateParams.endDate,
      subscriptionInfo
    );

    const historicalData = await StockService.getHistoricalPrices(
      stockId,
      dateRange,
      ["date", "open", "high", "low", "close", "volume"]
    );

    if (historicalData.length === 0) {
      return sendResponse(
        res,
        404,
        false,
        "No historical data found for the specified range"
      );
    }

    const csvRows = ["Date,Open,High,Low,Close,Volume"];
    historicalData.forEach((row: any) => {
      csvRows.push(
        `${row.date},${row.open},${row.high},${row.low},${row.close},${row.volume}`
      );
    });

    const csvData = csvRows.join("\n");

    res.header("Content-Type", "text/csv");
    res.attachment(`${symbol}_historical_data.csv`);
    res.send(csvData);
  } catch (error: any) {
    console.error("Error downloading historical data:", error);
    const statusCode =
      error.message === "No active subscription found"
        ? 403
        : error.message === "Stock not found"
        ? 404
        : error.message.includes("Invalid") || error.message.includes("valid")
        ? 400
        : 500;
    return sendResponse(
      res,
      statusCode,
      false,
      error.message || "Failed to download historical data"
    );
  }
};
