import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    // PGlite instanziiert pro Test eine WASM-Postgres-Instanz neu (Kaltstart-Kosten);
    // mit wachsender Testsuite reicht das Default-Timeout gelegentlich nicht mehr.
    // Der Kaltstart passiert meist in beforeEach (createTestDb()), das unter
    // hookTimeout läuft — nicht testTimeout. Beide müssen angehoben werden,
    // sonst flakt weiterhin trotz erhöhtem testTimeout (siehe Tasks 4/7/8).
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
