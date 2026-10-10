import { z } from "zod";

import { debugLog } from "@/lib/logger";
import { requestPublicOrigin } from "@/lib/runtime-config";
import { authenticateMcpRequest } from "@/mcp/auth";
import { readInvoicePdf } from "@/mcp/invoices";
import { McpToolError } from "@/mcp/types";

import { createApiOperations } from "./operations";
import { createOpenApiDocument } from "./openapi";
import { apiRoutes, getRequestSchema } from "./routes";

const maximumBodyBytes = 1024 * 1024;
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly headers?: HeadersInit) {
    super(message);
  }
}

function errorResponse(status: number, code: string, message: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  for (const [name, value] of Object.entries(privateHeaders)) responseHeaders.set(name, value);
  return Response.json({ error: { code, message } }, { status, headers: responseHeaders });
}

function matchPath(template: string, pathname: string): Record<string, string> | null {
  const expected = template.split("/");
  const actual = pathname.split("/");
  if (expected.length !== actual.length) return null;
  const parameters: Record<string, string> = {};
  for (let index = 0; index < expected.length; index++) {
    const segment = expected[index];
    if (segment.startsWith("{")) {
      if (!actual[index]) return null;
      try {
        parameters[segment.slice(1, -1)] = decodeURIComponent(actual[index]);
      } catch {
        throw new ApiError(400, "INVALID_INPUT", "The URL contains an invalid record identifier.");
      }
    } else if (actual[index] !== segment) return null;
  }
  return parameters;
}

function resolveRoute(pathname: string, method: string) {
  // Match a concrete path before considering methods, so /invoices/preview
  // cannot fall through to the /invoices/{invoiceId} resource on a GET.
  const first = apiRoutes.find((route) => matchPath(route.path, pathname) !== null);
  if (!first) throw new ApiError(404, "NOT_FOUND", "This API endpoint does not exist.");
  const routes = apiRoutes.filter((route) => route.path === first.path);
  const route = routes.find((route) => route.method === method);
  if (!route) {
    const methods: string[] = routes.map((route) => route.method);
    if (methods.includes("GET")) methods.push("HEAD");
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "This method is not supported by this endpoint.", { Allow: methods.join(", ") });
  }
  return { route, parameters: matchPath(route.path, pathname)! };
}

function queryInput(search: URLSearchParams, schema: z.core.$ZodType): Record<string, unknown> {
  const properties = z.toJSONSchema(schema, { io: "input" }).properties ?? {};
  const input: Record<string, unknown> = Object.create(null);
  for (const [key, value] of search) {
    if (!Object.hasOwn(properties, key) || Object.hasOwn(input, key)) {
      throw new ApiError(400, "INVALID_INPUT", "Query parameters must be known, unique fields for this endpoint.");
    }
    const field = properties[key];
    const type = typeof field === "object" ? field.type : undefined;
    if (type === "integer" || type === "number") {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
        throw new ApiError(400, "INVALID_INPUT", `${key} must be a number.`);
      }
      input[key] = Number(value);
    } else if (type === "boolean") {
      if (value !== "true" && value !== "false") {
        throw new ApiError(400, "INVALID_INPUT", `${key} must be true or false.`);
      }
      input[key] = value === "true";
    } else input[key] = value;
  }
  return input;
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > maximumBodyBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "API request bodies are limited to 1 MiB.");
  }
  if (!request.body) return {};
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send request bodies as application/json.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBodyBytes) {
        void reader.cancel().catch(() => undefined);
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "API request bodies are limited to 1 MiB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) return {};
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_INPUT", "The request body must be a JSON object.");
  }
  return input as Record<string, unknown>;
}

function attachment(filename: string) {
  return `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`;
}

async function respond(request: Request, onMutation?: () => void): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== requestPublicOrigin(request)) {
    throw new ApiError(403, "FORBIDDEN", "Origin is not permitted.");
  }
  const context = await authenticateMcpRequest(request);
  if (!context) {
    throw new ApiError(401, "UNAUTHORISED", "A valid Folio access token is required.", { "WWW-Authenticate": 'Bearer realm="Folio API"' });
  }
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/api\/v1(?=\/|$)/, "").replace(/\/$/, "") || "/";
  const method = request.method === "HEAD" ? "GET" : request.method;
  const operations = createApiOperations(context);
  if (pathname === "/" || pathname === "/openapi.json") {
    if (method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use GET for API discovery.", { Allow: "GET, HEAD" });
    if (url.search) throw new ApiError(400, "INVALID_INPUT", "This endpoint does not accept query parameters.");
    return Response.json(pathname === "/openapi.json"
      ? createOpenApiDocument(operations)
      : { data: { version: "v1", openapi: "/api/v1/openapi.json" } }, { headers: privateHeaders });
  }
  const { route, parameters } = resolveRoute(pathname, method);
  const operation = operations.get(route.operation)!;
  if (!operation.readOnly && context.access !== "write") {
    throw new ApiError(403, "FORBIDDEN", "This operation requires a read and write token.");
  }
  let fields: Record<string, unknown>;
  if (method === "GET") {
    fields = queryInput(url.searchParams, getRequestSchema(route, operation));
  } else {
    if (url.search) throw new ApiError(400, "INVALID_INPUT", "Send fields in the JSON body; this endpoint does not accept query parameters.");
    fields = await jsonBody(request);
    if (Object.keys(parameters).some((key) => Object.hasOwn(fields, key))) {
      throw new ApiError(400, "INVALID_INPUT", "Record identifiers must be supplied only in the URL path.");
    }
  }
  const input = route.bodyKey ? { ...parameters, [route.bodyKey]: fields } : { ...fields, ...parameters };
  if (route.format === "pdf") {
    const parsed = operation.schema.parse(input);
    const pdf = await readInvoicePdf(context, parsed.invoiceId as string, parsed.revisionId as string | undefined);
    return new Response(Buffer.from(pdf.data, "base64"), { headers: {
      ...privateHeaders, "Content-Type": pdf.mimeType, "Content-Disposition": attachment(pdf.filename),
    } });
  }
  const result = await operation.run(input);
  if (!operation.readOnly) {
    // A failed refresh must not invite a retry of a committed write.
    try { onMutation?.(); } catch { debugLog("api.cache.error"); }
  }
  if (route.format === "csv") {
    const page = result as { csv: string; filename: string; mimeType: string; total: number; limit: number; rowCount: number; nextOffset: number | null };
    return new Response(page.csv, { headers: {
      ...privateHeaders, "Content-Type": page.mimeType, "Content-Disposition": attachment(page.filename),
      "X-Next-Offset": page.nextOffset === null ? "" : String(page.nextOffset),
      "X-Total-Count": String(page.total), "X-Page-Limit": String(page.limit), "X-Row-Count": String(page.rowCount),
    } });
  }
  return Response.json({ data: result ?? null }, { status: route.status ?? 200, headers: privateHeaders });
}

export async function handleApiRequest(request: Request, onMutation?: () => void): Promise<Response> {
  let response: Response;
  try {
    response = await respond(request, onMutation);
  } catch (error) {
    if (error instanceof ApiError) response = errorResponse(error.status, error.code, error.message, error.headers);
    else if (error instanceof z.ZodError) {
      response = errorResponse(400, "INVALID_INPUT", error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
    } else if (error instanceof McpToolError) {
      const code = error.code.toUpperCase();
      const status = code === "NOT_FOUND" ? 404 : code === "CONFLICT" || code === "INVALID_STATE" ? 409 : code === "INVALID_INPUT" ? 400 : 422;
      response = errorResponse(status, code, error.message);
    } else {
      debugLog("api.request.error");
      response = errorResponse(500, "INTERNAL_ERROR", "Folio could not complete this operation. Check the record before retrying a write.");
    }
  }
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}
