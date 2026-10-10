import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { InvoiceDetail } from "@/features/invoices/types";
import type { Business } from "@/lib/db/types";

let database: typeof import("@/lib/db");
let tokens: typeof import("@/features/mcp/tokens");
let http: typeof import("./http");
let business: Business;
let readToken: string;
let writeToken: string;
let otherToken: string;
const endpoint = "https://folio.example/api/v1";

beforeAll(async () => {
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("APP_SECRET", "rest-api-test-secret-".repeat(4));
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  for (const id of ["api-owner", "api-other-owner"]) {
    await database.db.insertInto("auth_user").values({
      id, name: id, email: `${id}@example.invalid`, email_verified: 0,
      image: null, created_at: database.nowIso(), updated_at: database.nowIso(),
    }).execute();
  }
  const { ensureBusinessForUser } = await import("@/lib/db/businesses");
  business = await ensureBusinessForUser({
    userId: "api-owner", name: "API business", email: "api-owner@example.invalid", currency: "GBP",
  });
  const other = await ensureBusinessForUser({
    userId: "api-other-owner", name: "Other business", email: "api-other-owner@example.invalid", currency: "GBP",
  });
  tokens = await import("@/features/mcp/tokens");
  readToken = (await tokens.createMcpToken(business.id, { label: "API reader" })).token;
  writeToken = (await tokens.createMcpToken(business.id, { label: "API writer", access: "write" })).token;
  otherToken = (await tokens.createMcpToken(other.id, { label: "Other writer", access: "write" })).token;
  http = await import("./http");
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function request(path: string, options: {
  method?: string;
  token?: string | null;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: HeadersInit;
} = {}) {
  const headers = new Headers(options.headers);
  const token = options.token === undefined ? readToken : options.token;
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${endpoint}${path}`, {
    method: options.method ?? "GET", headers,
    body: options.body === undefined ? options.rawBody : JSON.stringify(options.body),
  });
}

function call(path: string, options?: Parameters<typeof request>[1]) {
  return http.handleApiRequest(request(path, options));
}

async function data<T>(response: Response, status = 200): Promise<T> {
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(json).toHaveProperty("data");
  return json.data as T;
}

async function customer(name = "API customer", token = writeToken) {
  return data<{ id: string; name: string; email: string }>(await call("/customers", {
    method: "POST", token, body: { name, email: "customer@example.invalid" },
  }), 201);
}

function invoiceInput(customerId: string) {
  return {
    customerId, currency: "GBP", issueDate: "2020-01-01", dueDate: "2020-01-15", exchangeRateMicros: 1_000_000,
    lines: [{ description: "Consulting", unit: "hour", quantityThousandths: 1000, unitPriceCents: 10000, taxRateBps: 2000 }],
  };
}

async function draft() {
  const client = await customer("Invoice customer");
  return data<InvoiceDetail>(await call("/invoices", {
    method: "POST", token: writeToken, body: invoiceInput(client.id),
  }), 201);
}

describe("Folio REST API over plain HTTP", () => {
  it("requires bearer authentication for discovery and records, including expired and revoked tokens", async () => {
    for (const path of ["", "/openapi.json", "/customers"]) {
      const response = await call(path, { token: null, headers: { cookie: "session=not-a-bearer-token" } });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect((await call("/customers", { token: `folio_mcp_${"x".repeat(43)}` })).status).toBe(401);
    const temporary = await tokens.createMcpToken(business.id, { label: "Temporary" });
    expect((await call("/customers", { token: temporary.token })).status).toBe(200);
    await tokens.revokeMcpToken(business.id, temporary.id);
    expect((await call("/customers", { token: temporary.token })).status).toBe(401);
    const expired = await tokens.createMcpToken(business.id, { label: "Expired" });
    await database.db.updateTable("mcp_access_tokens").set({ expires_at: "2000-01-01T00:00:00.000Z" })
      .where("id", "=", expired.id).execute();
    expect((await call("/customers", { token: expired.token })).status).toBe(401);
  });

  it("publishes authenticated OpenAPI discovery for HTTP clients", async () => {
    expect(await data(await call(""))).toEqual({ version: "v1", openapi: "/api/v1/openapi.json" });
    const response = await call("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const document = await response.json();
    expect(document.openapi).toMatch(/^3\.1\./);
    expect(document.components.securitySchemes).toEqual(expect.objectContaining({
      bearerAuth: expect.objectContaining({ type: "http", scheme: "bearer" }),
    }));
    expect(document.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(document.paths).length).toBeGreaterThan(30);
    expect(document.paths["/customers"].post.responses).toHaveProperty("201");
    expect(document.paths["/customers"].get.responses).toHaveProperty("200");
    expect(document.paths["/invoices/{invoiceId}/pdf"].get.responses["200"].content).toHaveProperty("application/pdf");
  });

  it("allows read-only POST previews while refusing actual writes", async () => {
    const client = await customer("Preview customer");
    const before = await database.db.selectFrom("invoices").select("id").execute();
    const preview = await data<{ invoice: { total_cents: number } }>(await call("/invoices/preview", {
      method: "POST", body: invoiceInput(client.id),
    }));
    expect(preview.invoice.total_cents).toBe(12000);
    for (const [path, method, body] of [
      ["/customers", "POST", { name: "Forbidden" }],
      [`/customers/${client.id}`, "PATCH", { name: "Forbidden" }],
      ["/invoices", "POST", invoiceInput(client.id)],
    ] as const) {
      const response = await call(path, { method, body });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
    expect(await database.db.selectFrom("invoices").select("id").execute()).toEqual(before);
    expect(await data(await call(`/customers/${client.id}`))).toMatchObject({ name: "Preview customer" });
  });

  it("creates and flat-patches a customer without clearing omitted fields", async () => {
    const client = await customer();
    const patched = await data(await call(`/customers/${client.id}`, {
      method: "PATCH", token: writeToken, body: { name: "Updated customer" },
    }));
    expect(patched).toMatchObject({ id: client.id, name: "Updated customer", email: "customer@example.invalid" });
    expect(await data(await call(`/customers/${client.id}`, {
      method: "PATCH", token: writeToken, body: { email: null },
    }))).toMatchObject({ name: "Updated customer", email: null });
  });

  it("preserves schema transformations when optional business fields are cleared", async () => {
    expect(await data(await call("/business", {
      method: "PATCH", token: writeToken, body: { phone: "01234 567890" },
    }))).toMatchObject({ phone: "01234 567890" });
    expect(await data(await call("/business", {
      method: "PATCH", token: writeToken, body: { phone: "" },
    }))).toMatchObject({ phone: null, name: "API business" });
  });

  it("scopes reads and writes to the bearer token's business", async () => {
    const foreign = await customer("Foreign secret customer", otherToken);
    for (const options of [{}, { method: "PATCH", token: writeToken, body: { name: "Replaced" } }]) {
      const response = await call(`/customers/${foreign.id}`, options);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("Foreign secret");
    }
    const results = await data<{ customers: Array<{ id: string }> }>(await call("/customers?q=Foreign"));
    expect(results.customers).toEqual([]);
    expect(await data(await call(`/customers/${foreign.id}`, { token: otherToken })))
      .toMatchObject({ name: "Foreign secret customer" });
    expect((await call("/invoices", { method: "POST", token: writeToken, body: invoiceInput(foreign.id) })).status).toBe(409);
  });

  it("rejects unknown fields, conflicting identifiers and nested input without silently dropping them", async () => {
    const client = await customer("Strict inputs");
    const cases: Array<[string, Parameters<typeof request>[1]]> = [
      ["/customers?business_id=other", {}],
      ["/customers?page=1&page=2", {}],
      [`/customers/${client.id}?id=${client.id}`, {}],
      ["/customers/not-a-uuid", {}],
      ["/customers", { method: "POST", body: { name: "Invalid", business_id: "other" } }],
      [`/customers/${client.id}`, { method: "PATCH", body: { id: client.id, name: "Invalid" } }],
      [`/customers/${client.id}`, { method: "PATCH", body: { changes: { name: "Invalid" } } }],
      ["/invoices", { method: "POST", body: { ...invoiceInput(client.id), lines: [{ ...invoiceInput(client.id).lines[0], secret: true }] } }],
    ];
    for (const [path, options] of cases) {
      const response = await call(path, { ...options, token: writeToken });
      expect(response.status, path).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    }
    expect((await call(`/customers/${database.newId()}`)).status).toBe(404);
    expect(await data(await call(`/customers/${client.id}`))).toMatchObject({ name: "Strict inputs" });
  });

  it("parses numeric and boolean query fields without truthy or permissive coercion", async () => {
    expect(await data(await call("/customers?page=2&limit=1"))).toMatchObject({ pagination: { page: 2, limit: 1 } });
    for (const value of ["true", "false"]) {
      expect((await call(`/payable-invoices?overdueOnly=${value}&pageSize=1`)).status).toBe(200);
    }
    for (const query of ["page=", "page=0", "page=1.5", "page=0x10", "page=NaN", "limit=101"]) {
      expect((await call(`/customers?${query}`)).status, query).toBe(400);
    }
    for (const value of ["1", "0", "TRUE", ""]) {
      expect((await call(`/payable-invoices?overdueOnly=${value}`)).status, value).toBe(400);
    }
  });

  it("issues an invoice once and records receipts without accepting overpayments", async () => {
    const created = await draft();
    const updateBody = { ...invoiceInput(created.invoice.customer_id!), expectedUpdatedAt: created.invoice.updated_at, notes: "Reviewed draft" };
    const updated = await data<InvoiceDetail>(await call(`/invoices/${created.invoice.id}`, {
      method: "PUT", token: writeToken, body: updateBody,
    }));
    const stale = await call(`/invoices/${created.invoice.id}`, { method: "PUT", token: writeToken, body: updateBody });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "INVALID_STATE", message: expect.stringContaining("changed") } });
    const issueBody = { expectedUpdatedAt: updated.invoice.updated_at, confirm: true };
    const issued = await data<InvoiceDetail>(await call(`/invoices/${created.invoice.id}/issue`, {
      method: "POST", token: writeToken, body: issueBody,
    }));
    expect(issued.invoice.lifecycle).toBe("issued");
    expect(issued.invoice.invoice_number).toBeTruthy();
    expect(issued.invoice.updated_at).not.toBe(created.invoice.updated_at);
    const conflict = await call(`/invoices/${created.invoice.id}/issue`, { method: "POST", token: writeToken, body: issueBody });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
    const payment = { invoiceId: created.invoice.id, currency: "GBP", paymentDate: "2020-01-10", amountCents: 5000, method: "bank_transfer" };
    expect(await data(await call("/payments", { method: "POST", token: writeToken, body: payment }), 201))
      .toMatchObject({ payment: { invoice_id: created.invoice.id, amount_cents: 5000 } });
    expect((await call("/payments", { method: "POST", token: writeToken, body: { ...payment, amountCents: 7001 } })).status).toBe(400);
    const detail = await data<InvoiceDetail>(await call(`/invoices/${created.invoice.id}`));
    expect(detail).toMatchObject({ paidCents: 5000, balanceDueCents: 7000 });
    expect(detail.payments).toHaveLength(1);
    expect(detail.invoice.invoice_number).toBe(issued.invoice.invoice_number);
    const hidden = await call(`/invoices/${created.invoice.id}/pdf`, { token: otherToken });
    expect(hidden.status).toBe(404);
  });

  it("returns an authenticated binary PDF with download headers", async () => {
    const invoice = await draft();
    const response = await call(`/invoices/${invoice.invoice.id}/pdf`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="[a-zA-Z0-9._-]+\.pdf"$/);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("downloads CSV pages with explicit continuation and count headers", async () => {
    for (const vendor of ["=First vendor", "Second vendor"]) {
      await data(await call("/expenses", {
        method: "POST", token: writeToken,
        body: { vendor, category: "Office", expense_date: "2021-02-03", currency: "GBP", subtotal_cents: 1250 },
      }), 201);
    }
    const path = "/reports/entries.csv?from=2021-02-03&to=2021-02-03&kind=expense&limit=1";
    const first = await call(path);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/csv");
    expect(first.headers.get("content-disposition")).toContain(".csv");
    expect(first.headers.get("x-total-count")).toBe("2");
    expect(first.headers.get("x-next-offset")).toBe("1");
    expect(first.headers.get("x-page-limit")).toBe("1");
    expect(first.headers.get("x-row-count")).toBe("1");
    const second = await call(`${path}&offset=1`);
    expect(second.headers.get("x-next-offset")).toBe("");
    expect(second.headers.get("x-row-count")).toBe("1");
    const contents = [await first.text(), await second.text()];
    expect(contents.every((page) => page.includes('"Type","Date"'))).toBe(true);
    expect(contents.join("\n")).toContain("'=First vendor");
  });

  it("rejects malformed JSON, non-object bodies and unsupported media types", async () => {
    for (const rawBody of ["{broken", "null", "[]", '"string"', new Uint8Array([0xff])]) {
      const response = await call("/customers", {
        method: "POST", token: writeToken, rawBody, headers: { "content-type": "application/json" },
      });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toMatch(/stack|sqlite|token_hash/i);
    }
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded"]) {
      expect((await call("/customers", {
        method: "POST", token: writeToken, rawBody: '{"name":"Invalid media type"}', headers: { "content-type": contentType },
      })).status).toBe(415);
    }
  });

  it("bounds request bodies by their actual size as well as declared length", async () => {
    for (const [rawBody, headers] of [
      ["x".repeat(1024 * 1024 + 1), {}],
      ["{}", { "content-length": String(1024 * 1024 + 1) }],
    ] as const) {
      const response = await call("/customers", {
        method: "POST", token: writeToken, rawBody, headers: { ...headers, "content-type": "application/json" },
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
    }
    const chunked = new Request(`${endpoint}/customers`, {
      method: "POST", duplex: "half",
      headers: { authorization: `Bearer ${writeToken}`, "content-type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(512 * 1024));
          controller.enqueue(new Uint8Array(512 * 1024 + 1));
          controller.close();
        },
      }),
    } as RequestInit & { duplex: "half" });
    expect(chunked.headers.has("content-length")).toBe(false);
    expect((await http.handleApiRequest(chunked)).status).toBe(413);
  });

  it("rejects URL credentials and untrusted origins before a write", async () => {
    const before = await database.db.selectFrom("customers").select("id").execute();
    for (const path of [`/customers?access_token=${writeToken}`, `/openapi.json?token=${writeToken}`]) {
      expect((await call(path, { token: writeToken })).status).toBe(400);
    }
    expect((await call("/customers?name=Query-only", { method: "POST", token: writeToken })).status).toBe(400);
    expect((await call("/customers", {
      method: "POST", token: writeToken, body: { name: "Untrusted origin" }, headers: { origin: "https://evil.example" },
    })).status).toBe(403);
    expect((await call("/customers", { headers: { origin: "https://folio.example" } })).status).toBe(200);
    expect(await database.db.selectFrom("customers").select("id").execute()).toEqual(before);
  });

  it("handles HEAD and method errors without invoking mutation endpoints", async () => {
    const before = await database.db.selectFrom("customers").select("id").execute();
    const head = await call("/customers", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const unauthorised = await call("/customers", { method: "HEAD", token: null });
    expect(unauthorised.status).toBe(401);
    expect(await unauthorised.text()).toBe("");
    for (const [path, method] of [["/invoices/preview", "GET"], ["/invoices/preview", "HEAD"], ["/customers", "PUT"]]) {
      const response = await call(path, { method, token: writeToken });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBeTruthy();
    }
    expect((await call("/no-such-endpoint", { method: "POST", token: writeToken, body: { name: "Unknown" } })).status).toBe(404);
    expect((await call("/customers/%FF", { token: writeToken })).status).toBe(400);
    expect(await database.db.selectFrom("customers").select("id").execute()).toEqual(before);
  });

  it("redacts unexpected internal errors and keeps successful writes successful when cache refresh fails", async () => {
    const spy = vi.spyOn(database.db, "selectFrom").mockImplementationOnce(() => {
      throw new Error("sqlite token_hash internal private database location");
    });
    const failed = await call("/customers");
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: {
      code: "INTERNAL_ERROR", message: "Folio could not complete this operation. Check the record before retrying a write.",
    } });
    spy.mockRestore();
    const refresh = vi.fn(() => { throw new Error("Cache refresh failed"); });
    const response = await http.handleApiRequest(request("/customers", {
      method: "POST", token: writeToken, body: { name: "Committed despite refresh failure" },
    }), refresh);
    const created = await data<{ id: string }>(response, 201);
    expect(refresh).toHaveBeenCalledOnce();
    expect(await data(await call(`/customers/${created.id}`))).toMatchObject({ name: "Committed despite refresh failure" });
    expect(await database.db.selectFrom("customers").select("id").where("name", "=", "Committed despite refresh failure").execute()).toHaveLength(1);
  });
});
