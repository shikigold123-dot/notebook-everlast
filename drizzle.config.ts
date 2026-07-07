import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const isMigrate = process.argv.some((arg) => arg.includes("migrate"));
if (isMigrate && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL fehlt — bitte in .env.local eintragen (siehe README, Abschnitt Setup)."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://nur-fuer-generate",
  },
});
