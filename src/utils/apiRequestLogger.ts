import pool from "../db/dbClient";

export const logApiRequest = async (req: any, res: any, next: any) => {
  const startTime = Date.now();

  res.on("finish", async () => {
    try {
      const apiKey = req.header("x-api-key");
      const endpoint = req.originalUrl;
      const method = req.method;
      const statusCode = res.statusCode;
      const userId = req.user?.id || null;
      const query = `
        INSERT INTO request_logs (user_id, endpoint, method, status_code, timestamp)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      await pool.query(query, [userId, endpoint, method, statusCode]);

      const responseTime = Date.now() - startTime;
      console.log(
        `Logged request: ${method} ${endpoint} [${statusCode}] - ${responseTime}ms`
      );
    } catch (error) {
      console.error("Error logging API request:", error);
    }
  });

  next();
};
