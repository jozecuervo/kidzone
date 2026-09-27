import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node ./server.mjs",
    env: {
      HOST: "127.0.0.1",
      PORT: "4173"
    },
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:4173"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1280,
          height: 900
        }
      }
    }
  ]
});
