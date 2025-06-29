import express from "express";
import stocksRoutes from "./routes/stockRoutes";
import userRoutes from "./routes/userRoutes";
import plansRoutes from "./routes/plansRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import { validateApiKey } from "./utils/apiKeyValidator";
import { authMiddleware } from "./middlewares/authMiddleware";
import cors from "cors";
import "dotenv/config";
import { validateApiKeyRedis } from "./utils/apiKeyValidatorRedis";

const app = express();
const PORT = process.env.PORT || 8001;
app.use(cors());

app.use(express.json());

app.use("/api/stocks", authMiddleware, validateApiKeyRedis, stocksRoutes);
app.use("/api/users", userRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/payments", authMiddleware, paymentRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
