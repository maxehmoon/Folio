import type { Page } from "@playwright/test";

import { expect, test } from "./fixture";

async function rpc(page: Page, token: string | null, method: string, params: Record<string, unknown> = {}) {
  return page.evaluate(async ({ token, method, params }) => {
    const response = await fetch("/api/mcp", {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await response.text();
    const body = response.headers.get("content-type")?.includes("text/event-stream")
      ? text.split(/\r?\n\r?\n/)
        .map((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n"))
        .filter(Boolean)
        .map((data) => JSON.parse(data))
        .find((message) => message.id === 1)
      : JSON.parse(text);
    return { status: response.status, body };
  }, { token, method, params });
}

test("MCP tokens are created once, enforce read/write access and can be revoked", async ({ folio, page }) => {
  await page.goto(`${folio.origin}/setup`);
  await page.getByLabel("Your name").fill("MCP Test Owner");
  await page.getByLabel("Sign-in email").fill("mcp-owner@example.test");
  await page.getByLabel(/^Password/).fill("A-browser-regression-password-123!");
  await page.getByLabel("Confirm password").fill("A-browser-regression-password-123!");
  await page.getByLabel("Setup token", { exact: false }).fill(folio.setupToken);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Your organisation" })).toBeVisible();
  await page.getByLabel("Trading name").fill("MCP Browser Tests");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Address (required)", { exact: true }).fill("1 Test Street");
  await page.getByLabel("City").fill("London");
  await page.getByLabel("Postcode").fill("SW1A 1AA");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("combobox", { name: "Reporting currency" }).click();
  await page.getByPlaceholder("Search currencies…").fill("GBP");
  await page.getByRole("option", { name: /GBP/ }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

  await page.goto(`${folio.origin}/settings#mcp`);
  await expect(page.getByRole("combobox", { name: "Access", exact: true })).toHaveText("Read only");
  await expect(page.getByRole("combobox", { name: "Expires after" })).toHaveText("30 days");
  await page.getByLabel("Connection name").fill("Browser reader");
  await page.getByRole("button", { name: "Create access token" }).click();
  const secret = page.getByLabel("New MCP access token");
  await expect(secret).toBeVisible();
  const readToken = await secret.inputValue();
  expect(readToken).toMatch(/^folio_mcp_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("list", { name: "MCP connections" })).toContainText("Browser reader");
  await page.getByRole("button", { name: "I have saved it" }).click();
  await expect(secret).toHaveCount(0);
  await page.reload();
  await expect(secret).toHaveCount(0);

  expect((await rpc(page, null, "tools/list")).status).toBe(401);
  const initialised = await rpc(page, readToken, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "browser-regression", version: "1" },
  });
  expect(initialised.status).toBe(200);
  expect(initialised.body.result.serverInfo.name).toBe("folio");
  const readerTools = await rpc(page, readToken, "tools/list");
  expect(readerTools.status).toBe(200);
  const readNames = readerTools.body.result.tools.map((tool: { name: string }) => tool.name);
  expect(readNames).toContain("folio_list_customers");
  expect(readNames).not.toContain("folio_create_customer");
  const forbidden = await rpc(page, readToken, "tools/call", {
    name: "folio_create_customer", arguments: { name: "Forbidden customer" },
  });
  expect(forbidden.body.error).toBeTruthy();

  await page.getByLabel("Connection name").fill("Browser writer");
  await page.getByRole("combobox", { name: "Access", exact: true }).click();
  await page.getByRole("option", { name: "Read and write", exact: true }).click();
  await page.getByRole("combobox", { name: "Expires after" }).click();
  await page.getByRole("option", { name: "90 days", exact: true }).click();
  await page.getByRole("button", { name: "Create access token" }).click();
  await expect(secret).toBeVisible();
  const writeToken = await secret.inputValue();
  expect(writeToken).not.toBe(readToken);
  const writerTools = await rpc(page, writeToken, "tools/list");
  expect(writerTools.body.result.tools.map((tool: { name: string }) => tool.name)).toContain("folio_create_customer");
  const created = await rpc(page, writeToken, "tools/call", {
    name: "folio_create_customer", arguments: { name: "Customer from MCP" },
  });
  expect(created.body.result.isError).not.toBe(true);
  expect(created.body.result.structuredContent.result.name).toBe("Customer from MCP");
  const customers = await rpc(page, readToken, "tools/call", { name: "folio_list_customers", arguments: {} });
  expect(customers.body.result.structuredContent.result.customers).toHaveLength(1);

  await page.getByRole("button", { name: "Revoke Browser reader", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Browser reader" })).toContainText("Revoked");
  expect((await rpc(page, readToken, "tools/list")).status).toBe(401);
  expect((await rpc(page, writeToken, "tools/list")).status).toBe(200);
  await page.getByRole("button", { name: "Revoke Browser writer", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Browser writer" })).toContainText("Revoked");
  expect((await rpc(page, writeToken, "tools/list")).status).toBe(401);
});
