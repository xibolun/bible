import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.BIBLE_CHROME_PATH },
  },
  webServer: {
    command: "npm run test:serve",
    env: { VITE_DATA_MODE: "mock" },
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
