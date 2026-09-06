import type { BrowserContext, Page } from "@playwright/test";

import { expect, test } from "./fixture";

const owner = {
  email: "owner@example.test",
  password: "A-browser-regression-password-123!",
};

async function expectSessionCookie(context: BrowserContext, origin: string, secure: boolean) {
  const cookies = (await context.cookies(origin)).filter((cookie) =>
    cookie.name.endsWith(".session_token"),
  );
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ secure, httpOnly: true, sameSite: "Lax" });
  expect(cookies[0].name.startsWith("__Secure-")).toBe(secure);
}

async function openWithoutReferrer(page: Page, url: string) {
  await page.goto("about:blank");
  const navigation = page.waitForRequest((request) => request.isNavigationRequest());
  await page.goto(url);
  const request = await navigation;
  expect(request.headers().origin).toBeUndefined();
  expect(request.headers().referer).toBeUndefined();
}

const scenarios = [
  { name: "HTTP hostname", tls: false, setupDefaults: {} },
  { name: "HTTPS reverse proxy", tls: true, setupDefaults: {} },
  {
    name: "configured setup defaults",
    tls: false,
    setupDefaults: { country: "DE", currency: "EUR" },
  },
];

for (const { name, tls, setupDefaults } of scenarios) {
  test.describe(name, () => {
    test.use({ tls, setupDefaults });

    test("zero-config setup and sign-in keep a browser session", async ({ folio, page, context, browser }) => {
      await page.goto(`${folio.origin}/setup`);
      await page.getByLabel("Your name").fill("Folio Test Owner");
      await page.getByLabel("Sign-in email").fill(owner.email);
      await page.getByLabel(/^Password/).fill(owner.password);
      await page.getByLabel("Confirm password").fill(owner.password);
      await page.getByLabel("Setup token", { exact: false }).fill(folio.setupToken);
      await page.getByRole("button", { name: "Save and continue" }).click();

      await expect(page.getByRole("heading", { name: "Your organisation" })).toBeVisible();
      await expectSessionCookie(context, folio.origin, tls);
      await openWithoutReferrer(page, `${folio.origin}/setup`);
      await expect(page.getByRole("heading", { name: "Your organisation" })).toBeVisible();
      await page.getByLabel("Trading name").fill("Folio Browser Tests");
      await page.getByRole("button", { name: "Continue", exact: true }).click();

      await expect(page.getByRole("heading", { name: "Business address" })).toBeVisible();
      await page.getByLabel("Address (required)", { exact: true }).fill("1 Test Street");
      await page.getByLabel("City").fill("London");
      await page.getByLabel("Postcode").fill("SW1A 1AA");
      if (setupDefaults.country) {
        await expect(page.getByRole("combobox", { name: "Country" })).toHaveText("Germany");
      }
      await page.getByRole("combobox", { name: "Country" }).click();
      await page.getByPlaceholder("Search countries…").fill("United Kingdom");
      await page.getByRole("option", { name: /United Kingdom/ }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();

      await expect(page.getByRole("heading", { name: "Invoice defaults" })).toBeVisible();
      if (setupDefaults.currency) {
        await expect(page.getByRole("combobox", { name: "Reporting currency" })).toHaveText("EUR");
      }
      await page.getByRole("combobox", { name: "Reporting currency" }).click();
      await page.getByPlaceholder("Search currencies…").fill("GBP");
      await page.getByRole("option", { name: /GBP/ }).click();
      if (setupDefaults.country) {
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "Country" })).toHaveText("United Kingdom");
        await page.reload();
        await expect(page.getByRole("combobox", { name: "Country" })).toHaveText("United Kingdom");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "Reporting currency" })).toHaveText("GBP");
      }
      await page.getByRole("button", { name: "Finish setup" }).click();
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

      await openWithoutReferrer(page, `${folio.origin}/`);
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      expect((await context.cookies(folio.origin)).filter((cookie) =>
        cookie.name.endsWith(".session_token"),
      )).toHaveLength(0);

      await page.getByLabel("Email address").fill(owner.email);
      await page.getByLabel("Password", { exact: true }).fill(owner.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
      await expectSessionCookie(context, folio.origin, tls);

      await page.goto("about:blank");
      await folio.restart();
      await openWithoutReferrer(page, `${folio.origin}/`);
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
      await expectSessionCookie(context, folio.origin, tls);
      await page.goto(`${folio.origin}/settings`);
      await expect(page.getByRole("combobox", { name: "Country", exact: true })).toHaveText("United Kingdom");
      await expect(page.getByRole("combobox", { name: "Currency", exact: true })).toHaveText("GBP");
      expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");

      await openWithoutReferrer(page, `${folio.origin}/`);
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
      const sessionEmail = await page.evaluate(async () => {
        const response = await fetch("/api/auth/get-session");
        const session = await response.json();
        return session?.user?.email;
      });
      expect(sessionEmail).toBe(owner.email);

      const previousSession = await context.storageState();
      const newPassword = "A-replacement-browser-password-456!";
      await page.goto(`${folio.origin}/settings#account`);
      await page.getByLabel("Current password", { exact: true }).fill(owner.password);
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
      await expectSessionCookie(context, folio.origin, tls);
      await openWithoutReferrer(page, `${folio.origin}/`);
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
      const oldContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        storageState: previousSession,
      });
      try {
        const oldPage = await oldContext.newPage();
        await oldPage.goto(`${folio.origin}/`);
        await expect(oldPage.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      } finally {
        await oldContext.close();
      }
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      await page.getByLabel("Email address").fill(owner.email);
      await page.getByLabel("Password", { exact: true }).fill(newPassword);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
      await expectSessionCookie(context, folio.origin, tls);
    });
  });
}
