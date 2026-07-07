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
    // mit wachsender Testsuite reicht das 5s-Default-Timeout gelegentlich nicht mehr.
    testTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
