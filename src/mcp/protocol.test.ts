import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Business } from "@/lib/db/types";

let database: typeof import("@/lib/db");
let tokens: typeof import("@/features/mcp/tokens");
let http: typeof import("./http");
let business: Business;
let readToken: string;
let writeToken: string;
const clients: Client[] = [];
const endpoint = "https://folio.example/api/mcp";

beforeAll(async () => {
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("APP_SECRET", "mcp-protocol-test-secret-".repeat(4));
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  await database.db.insertInto("auth_user").values({
    id: "protocol-owner", name: "Owner", email: "protocol@example.invalid", email_verified: 0,
    image: null, created_at: database.nowIso(), updated_at: database.nowIso(),
  }).execute();
  business = await (await import("@/lib/db/businesses")).ensureBusinessForUser({
    userId: "protocol-owner", name: "Protocol business", email: "protocol@example.invalid", currency: "GBP",
  });
  tokens = await import("@/features/mcp/tokens");
  readToken = (await tokens.createMcpToken(business.id, { label: "Reader" })).token;
  writeToken = (await tokens.createMcpToken(business.id, { label: "Writer", access: "write" })).token;
  http = await import("./http");
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function connect(token = readToken) {
  const client = new Client({ name: "folio-tests", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (input, init) => http.handleMcpRequest(new Request(input, init)),
  }));
  return client;
}

function data(result: unknown): Record<string, unknown> {
  const record = result as { structuredContent?: { result: Record<string, unknown> }; content?: Array<{ type: string; text?: string }> };
  if (record.structuredContent) return record.structuredContent.result;
  const text = record.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Expected structured tool output");
  return JSON.parse(text).result;
}

describe("Folio MCP over Streamable HTTP", () => {
  it("discovers a serialisable tool catalogue with accurate read-only access, resources and prompts", async () => {
    const reader = await connect();
    const writer = await connect(writeToken);
    const readTools = (await reader.listTools()).tools;
    const writeTools = (await writer.listTools()).tools;
    expect(writeTools.length).toBeGreaterThan(50);
    expect(writeTools.length).toBeGreaterThan(readTools.length);
    expect(readTools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(readTools.some((tool) => tool.name === "folio_create_invoice")).toBe(false);
    expect(JSON.parse(JSON.stringify(writeTools))).toHaveLength(writeTools.length);
    expect((await reader.listResources()).resources.map((resource) => resource.uri)).toContain("folio://guide");
    expect((await reader.listResourceTemplates()).resourceTemplates.length).toBeGreaterThan(5);
    expect((await reader.listPrompts()).prompts).toHaveLength(3);
    const guide = await reader.readResource({ uri: "folio://guide" });
    expect(guide.contents[0]).toHaveProperty("text");
    for (const uri of ["folio://business", "folio://reference", "folio://reference/currencies", "folio://reference/payment_methods"]) {
      expect((await reader.readResource({ uri })).contents[0]).toHaveProperty("text");
    }
    const prompt = await reader.getPrompt({ name: "folio_month_end", arguments: { request: "September 2026" } });
    expect(prompt.messages[0].content).toMatchObject({ type: "text" });
    await expect(reader.callTool({ name: "folio_create_customer", arguments: { name: "Forbidden" } })).rejects.toThrow();
    expect(await database.db.selectFrom("customers").select("id").execute()).toHaveLength(0);
  });

  it("creates, reads through a resource, validates and patches records through the real protocol", async () => {
    const client = await connect(writeToken);
    const customer = data(await client.callTool({ name: "folio_create_customer", arguments: { name: "MCP customer", email: "customer@example.invalid" } }));
    expect(customer.name).toBe("MCP customer");
    const resource = await client.readResource({ uri: `folio://customers/${customer.id}` });
    expect(resource.contents[0]).toMatchObject({ mimeType: "application/json" });
    const invalid = await client.callTool({ name: "folio_update_customer", arguments: { id: customer.id, changes: { business_id: "another-business" } } });
    expect(invalid.isError).toBe(true);
    const patched = data(await client.callTool({ name: "folio_update_customer", arguments: { id: customer.id, changes: { name: "Updated customer" } } }));
    expect(patched).toMatchObject({ name: "Updated customer", email: "customer@example.invalid" });
    const businessResource = await client.readResource({ uri: "folio://business" });
    expect(businessResource.contents[0]).toHaveProperty("text");
    await expect(client.readResource({ uri: "folio://customers/nonexistent" })).rejects.toThrow();
  });

  it("authenticates every request, so revocation affects already-connected clients", async () => {
    const token = await tokens.createMcpToken(business.id, { label: "Revoked connection" });
    const client = await connect(token.token);
    await client.listTools();
    await tokens.revokeMcpToken(business.id, token.id);
    await expect(client.callTool({ name: "folio_get_business_settings", arguments: {} })).rejects.toThrow();
  });

  it("returns a native resource link and downloads a real invoice PDF through the authenticated transport", async () => {
    const client = await connect(writeToken);
    const customer = data(await client.callTool({ name: "folio_create_customer", arguments: { name: "PDF customer" } }));
    const draft = data(await client.callTool({ name: "folio_create_invoice", arguments: {
      customerId: customer.id, currency: "GBP", exchangeRateMicros: 1_000_000,
      lines: [{ description: "Consulting", unit: "hour", quantityThousandths: 1000, unitPriceCents: 10000, taxRateBps: 2000 }],
    } }));
    const invoice = draft.invoice as { id: string };
    const linked = await client.callTool({ name: "folio_get_invoice_pdf", arguments: { invoiceId: invoice.id } });
    expect(linked.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "resource_link", mimeType: "application/pdf" })]));
    const pdf = await client.readResource({ uri: data(linked).uri as string });
    const contents = pdf.contents[0] as { blob: string; mimeType: string };
    expect(contents.mimeType).toBe("application/pdf");
    expect(Buffer.from(contents.blob, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("rejects untrusted origins, URL credentials, unauthenticated traffic and oversized bodies", async () => {
    for (const method of ["POST", "GET", "DELETE"]) {
      const response = await http.handleMcpRequest(new Request(endpoint, { method }));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect((await http.handleMcpRequest(new Request(endpoint, { headers: { origin: "https://evil.example", authorization: `Bearer ${writeToken}` } }))).status).toBe(403);
    expect((await http.handleMcpRequest(new Request(`${endpoint}?access_token=${writeToken}`, { headers: { authorization: `Bearer ${writeToken}` } }))).status).toBe(400);
    const oversized = await http.handleMcpRequest(new Request(endpoint, {
      method: "POST", headers: { authorization: `Bearer ${writeToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "x".repeat(1024 * 1024 + 1),
    }));
    expect(oversized.status).toBe(413);
  });

  it("accepts legacy initialisation and returns protocol errors without exposing server details", async () => {
    const request = (body: string) => new Request(endpoint, {
      method: "POST", headers: { authorization: `Bearer ${readToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body,
    });
    const response = await http.handleMcpRequest(request(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy-test", version: "1" } },
    })));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"name":"folio"');
    const malformed = await http.handleMcpRequest(request("{broken"));
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).not.toMatch(/stack|sqlite|token_hash/i);
    const noStream = await http.handleMcpRequest(new Request(endpoint, { headers: { authorization: `Bearer ${readToken}` } }));
    expect(noStream.status).toBe(405);
  });
});
