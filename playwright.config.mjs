import { defineConfig, devices } from "@playwright/test";

const siteBasePath = "/kidzone/";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  outputDir: "./test-results",
  reporter: [["list"]],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: `http://127.0.0.1:4173${siteBasePath}`,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node ./server.mjs",
    env: {
      HOST: "127.0.0.1",
      PORT: "4173",
      SITE_BASE_PATH: siteBasePath
    },
    reuseExistingServer: !process.env.CI,
    url: `http://127.0.0.1:4173${siteBasePath}`
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
      testMatch: /project-(?:smoke|snapshots)\.spec\.mjs/,
      use: {
        ...devices["Pixel 5"],
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
