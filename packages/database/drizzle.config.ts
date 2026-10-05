import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(packageDirectory, "../../.env") });

const databaseUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL_DIRECT or DATABASE_URL to run Neon migrations");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
