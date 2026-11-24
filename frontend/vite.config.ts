import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import packageInfo from "./package.json" with { type: "json" };
export default defineConfig({
  define: {
    __BIBLE_VERSION__: JSON.stringify(
      process.env.BIBLE_APP_VERSION || `v${packageInfo.version}`,
    ),
  },
  plugins: [react()],
  base: "./",
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
  build: { chunkSizeWarningLimit: 1100 },
});
