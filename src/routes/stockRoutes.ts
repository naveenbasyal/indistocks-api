import express from "express";
import {
  getAllStocks,
  getStockBySymbol,
  getDailyData,
  searchStocks,
  getStockPerformance,
  getMovingAverages,
  getRSI,
  downloadHistoricalData,
} from "../controllers/stocksController";

const router = express.Router();

router.get("/", getAllStocks);
router.get("/search", searchStocks);
router.get("/:symbol", getStockBySymbol);
router.get("/:symbol/daily", getDailyData);

router.get("/performance/:symbol", getStockPerformance);

router.get("/moving-averages/:symbol", getMovingAverages);

router.get("/rsi/:symbol", getRSI);

router.get("/download/:symbol", downloadHistoricalData);

export default router;
