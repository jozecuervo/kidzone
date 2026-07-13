import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  reporter: [["list"]],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
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
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1280,
          height: 900
        }
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 390,
          height: 844
        },
        isMobile: true,
        hasTouch: true
      }
    }
  ]
});
