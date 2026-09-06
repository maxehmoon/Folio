import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./tmp/playwright-results",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    browserName: "chromium",
    ignoreHTTPSErrors: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--host-resolver-rules=MAP folio-e2e 127.0.0.1",
        "--no-proxy-server",
      ],
    },
  },
});
