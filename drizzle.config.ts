import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL)
  throw new Error("Missing required environment variable: DATABASE_URL");

export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL!,
  },
});
