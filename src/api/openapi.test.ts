import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Business } from "@/lib/db/types";
import type { ApiOperation } from "./operations";
import { apiRoutes, getRequestSchema, pathParameterNames } from "./routes";
import { createOpenApiDocument } from "./openapi";

let database: typeof import("@/lib/db");
let createApiOperations: typeof import("./operations")["createApiOperations"];
let operations: Map<string, ApiOperation>;
let business: Business;

beforeAll(async () => {
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("APP_SECRET", "api-catalogue-test-secret-".repeat(4));
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  await database.db.insertInto("auth_user").values({
    id: "api-catalogue-owner", name: "Owner", email: "catalogue@example.invalid", email_verified: 0,
    image: null, created_at: database.nowIso(), updated_at: database.nowIso(),
  }).execute();
  business = await (await import("@/lib/db/businesses")).ensureBusinessForUser({
    userId: "api-catalogue-owner", name: "Catalogue business", email: "catalogue@example.invalid", currency: "GBP",
  });
  ({ createApiOperations } = await import("./operations"));
  operations = createApiOperations({ business, userId: business.owner_user_id, access: "read" });
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("HTTP operation catalogue and OpenAPI", () => {
  it("maps every shared operation without duplicate method/path pairs or missing URL fields", () => {
    expect(operations.size).toBe(60);
    expect(new Set(apiRoutes.map((route) => route.operation))).toEqual(new Set(operations.keys()));
    expect(new Set(apiRoutes.map((route) => `${route.method} ${route.path}`)).size).toBe(apiRoutes.length);
    for (const route of apiRoutes) {
      const operation = operations.get(route.operation)!;
      for (const name of pathParameterNames(route)) expect(operation.schema.shape).toHaveProperty(name);
      if (route.method === "GET") expect(operation.readOnly).toBe(true);
      if (route.bodyKey) expect(operation.schema.shape).toHaveProperty(route.bodyKey);
    }
  });

  it("shares validation and handlers while leaving token enforcement to the HTTP boundary", async () => {
    expect(operations.has("create_customer")).toBe(true);
    expect(operations.get("create_customer")!.readOnly).toBe(false);
    expect(operations.get("preview_invoice")!.readOnly).toBe(true);
    const reference = operations.get("reference_data")!;
    await expect(reference.run({ kind: "payment_methods", limit: 1 })).resolves.toMatchObject({
      kind: "payment_methods", offset: 0, limit: 1, items: expect.any(Array),
    });
    await expect(reference.run({ kind: "currencies", business_id: "other" })).rejects.toThrow();
    await expect(reference.run({ kind: "currencies", limit: "1" })).rejects.toThrow();
  });

  it("generates serialisable OpenAPI with unique operations, bearer security and creation statuses", () => {
    const document = createOpenApiDocument(operations);
    expect(JSON.parse(JSON.stringify(document))).toMatchObject({
      openapi: "3.1.1", servers: [{ url: "/api/v1" }], security: [{ bearerAuth: [] }],
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    });
    const operationIds = new Set();
    for (const route of apiRoutes) {
      const endpoint = document.paths[route.path][route.method.toLowerCase()] as { operationId: string; responses: Record<string, unknown> };
      expect(operationIds.has(endpoint.operationId)).toBe(false);
      operationIds.add(endpoint.operationId);
      expect(endpoint.responses).toHaveProperty(String(route.status ?? 200));
      expect(endpoint.responses).toHaveProperty("401");
      expect(endpoint.responses).toHaveProperty("500");
    }
    expect(document.paths["/customers"].post).toMatchObject({ "x-folio-access": "write", responses: { 201: expect.any(Object) } });
    expect(document.paths["/invoices/preview"].post).toMatchObject({ "x-folio-access": "read", responses: { 200: expect.any(Object) } });
  });

  it("describes numeric and boolean queries and path identifiers using their actual input schemas", () => {
    const document = createOpenApiDocument(operations);
    expect(document.paths["/customers"].get).toMatchObject({ parameters: expect.arrayContaining([
      { name: "page", in: "query", required: false, schema: expect.objectContaining({ type: "integer", default: 1, minimum: 1 }) },
    ]) });
    expect(document.paths["/payable-invoices"].get).toMatchObject({ parameters: expect.arrayContaining([
      { name: "overdueOnly", in: "query", required: false, schema: expect.objectContaining({ type: "boolean" }) },
    ]) });
    expect(document.paths["/reference/{kind}"].get).toMatchObject({ parameters: expect.arrayContaining([
      { name: "kind", in: "path", required: true, schema: expect.objectContaining({ enum: ["currencies", "countries", "timezones", "payment_methods"] }) },
    ]) });
    expect(document.paths["/search"].get).toMatchObject({ parameters: expect.arrayContaining([
      { name: "query", in: "query", required: true, schema: expect.objectContaining({ type: "string" }) },
    ]) });
  });

  it("unwraps flat patch bodies and removes URL identifiers without losing strictness or input transforms", () => {
    const patch = apiRoutes.find((route) => route.operation === "update_customer")!;
    const patchSchema = z.toJSONSchema(getRequestSchema(patch, operations.get(patch.operation)!), { io: "input" });
    expect(patchSchema).toMatchObject({ type: "object", additionalProperties: false, properties: { name: { type: "string" } } });
    expect(patchSchema.properties).not.toHaveProperty("changes");
    expect(patchSchema.properties).not.toHaveProperty("id");
    const issue = apiRoutes.find((route) => route.operation === "issue_invoice")!;
    const issueSchema = z.toJSONSchema(getRequestSchema(issue, operations.get(issue.operation)!), { io: "input" });
    expect(issueSchema.required).toEqual(expect.arrayContaining(["expectedUpdatedAt", "confirm"]));
    expect(issueSchema.properties).not.toHaveProperty("invoiceId");
    const document = createOpenApiDocument(operations);
    expect(document.paths["/business"].patch).toMatchObject({ requestBody: { content: {
      "application/json": { schema: { properties: { phone: expect.objectContaining({ type: "string" }) } } },
    } } });
  });

  it("documents native downloads, CSV pagination and all transport error codes", () => {
    const document = createOpenApiDocument(operations);
    for (const path of ["/invoices/{invoiceId}/pdf", "/invoices/{invoiceId}/revisions/{revisionId}/pdf"]) {
      expect(document.paths[path].get).toMatchObject({ responses: { 200: { content: { "application/pdf": { schema: { type: "string", format: "binary" } } } } } });
    }
    expect(document.paths["/reports/entries.csv"].get).toMatchObject({ responses: { 200: {
      content: { "text/csv": { schema: { type: "string" } } },
      headers: { "X-Next-Offset": expect.any(Object), "X-Total-Count": expect.any(Object), "X-Page-Limit": expect.any(Object), "X-Row-Count": expect.any(Object) },
    } } });
    const endpoint = document.paths["/customers"].post as { responses: Record<string, unknown> };
    expect(Object.keys(endpoint.responses)).toEqual(expect.arrayContaining(["400", "401", "403", "404", "405", "409", "413", "415", "422", "500"]));
  });

  it("places static preview and run routes before record parameters", () => {
    const position = (path: string) => apiRoutes.findIndex((route) => route.path === path);
    expect(position("/invoices/preview")).toBeLessThan(position("/invoices/{invoiceId}"));
    expect(position("/recurring-invoices/preview-dates")).toBeLessThan(position("/recurring-invoices/{id}"));
    expect(position("/recurring-invoices/run-due")).toBeLessThan(position("/recurring-invoices/{id}"));
  });
});
