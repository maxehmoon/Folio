import { z } from "zod";

import { version } from "../../package.json";
import type { ApiOperation } from "./operations";
import { apiRoutes, getRequestSchema, pathParameterNames, type ApiRoute } from "./routes";

type OpenApiObject = Record<string, unknown>;

function jsonSchema(schema: z.core.$ZodType) {
  const document = z.toJSONSchema(schema, { io: "input" });
  delete document.$schema;
  return document;
}

const errorResponses = {
  400: "Invalid input or malformed JSON (INVALID_INPUT, INVALID_JSON).",
  401: "Missing, expired or revoked bearer token (UNAUTHORISED).",
  403: "Insufficient token access or disallowed origin (FORBIDDEN).",
  404: "Endpoint or record not found in this business (NOT_FOUND).",
  405: "HTTP method is not supported by this endpoint (METHOD_NOT_ALLOWED).",
  409: "The record changed or this action is not valid in its current state (CONFLICT, INVALID_STATE).",
  413: "The request body exceeds 1 MiB (PAYLOAD_TOO_LARGE).",
  415: "A request body was sent without application/json (UNSUPPORTED_MEDIA_TYPE).",
  422: "The requested result exceeds the response limit (RESULT_TOO_LARGE, OUTPUT_TOO_LARGE).",
  500: "An unexpected error occurred; inspect the record before retrying a write (INTERNAL_ERROR).",
};

function successResponse(route: ApiRoute): OpenApiObject {
  if (!route.format) return {
    description: route.status === 201 ? "Record created." : "Operation completed.",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } },
  };
  const headers: OpenApiObject = {
    "Content-Disposition": { description: "Attachment filename.", schema: { type: "string" } },
  };
  if (route.format === "csv") Object.assign(headers, {
    "X-Next-Offset": { description: "Offset for the next page, or an empty string when complete.", schema: { type: "string", pattern: "^[0-9]*$" } },
    "X-Total-Count": { description: "Total matching entries.", schema: { type: "integer", minimum: 0 } },
    "X-Page-Limit": { description: "Requested maximum number of entries per page.", schema: { type: "integer", minimum: 1 } },
    "X-Row-Count": { description: "Number of entries in this CSV page.", schema: { type: "integer", minimum: 0 } },
  });
  return {
    description: route.format === "pdf" ? "Invoice PDF, limited to 2 MiB." : "One CSV page, limited to 100 entries and 256 KiB. Follow X-Next-Offset until empty; each page includes a header row.",
    headers,
    content: {
      [route.format === "pdf" ? "application/pdf" : "text/csv"]: {
        schema: route.format === "pdf" ? { type: "string", format: "binary" } : { type: "string" },
      },
    },
  };
}

function routeDescription(route: ApiRoute, operation: ApiOperation) {
  const source = route.format === "pdf"
    ? "Download the current invoice or a saved revision as a PDF attachment. The PDF is returned directly and is limited to 2 MiB."
    : operation.description;
  const description = source.replace(/folio_(\w+)/g, (name, operationName: string) => {
    const route = apiRoutes.find((candidate) => candidate.operation === operationName);
    return route ? `${route.method} ${route.path}` : name;
  });
  return `${description}\n\n${operation.readOnly ? "Accepts read or write tokens; this operation does not change records." : "Requires a read and write token."}`;
}

export function createOpenApiDocument(operations: Map<string, ApiOperation>) {
  const paths: Record<string, OpenApiObject> = {};
  for (const route of apiRoutes) {
    const operation = operations.get(route.operation)!;
    const requestSchema = jsonSchema(getRequestSchema(route, operation));
    const parameters: OpenApiObject[] = pathParameterNames(route).map((name) => ({
      name, in: "path", required: true,
      schema: jsonSchema(operation.schema.shape[name]),
    }));
    if (route.method === "GET") {
      for (const [name, schema] of Object.entries(requestSchema.properties ?? {})) {
        parameters.push({ name, in: "query", required: requestSchema.required?.includes(name) ?? false, schema });
      }
    }
    const responses: OpenApiObject = { [route.status ?? 200]: successResponse(route) };
    for (const [status, description] of Object.entries(errorResponses)) {
      responses[status] = { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    }
    const endpoint: OpenApiObject = {
      operationId: `${route.operation}${route.path.includes("{revisionId}/pdf") ? "_revision" : ""}`,
      summary: route.operation.replaceAll("_", " "),
      description: routeDescription(route, operation),
      tags: [route.path.split("/")[1]],
      "x-folio-access": operation.readOnly ? "read" : "write",
      parameters,
      responses,
    };
    if (route.method !== "GET" && Object.keys(requestSchema.properties ?? {}).length > 0) {
      endpoint.requestBody = {
        required: Boolean(route.bodyKey || requestSchema.required?.length),
        description: "JSON object; URL path identifiers must not be repeated in the body. Unknown fields are rejected. Domain validation also applies.",
        content: { "application/json": { schema: requestSchema } },
      };
    }
    (paths[route.path] ??= {})[route.method.toLowerCase()] = endpoint;
  }
  return {
    openapi: "3.1.1",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "Folio HTTP API",
      version,
      description: "Business-scoped HTTP API. Create bearer tokens in Settings → API and MCP access. Monetary amounts are integer hundredths, quantities are thousandths, tax rates are basis points and exchange rates are millionths. GET inputs are query parameters; all other inputs use JSON bodies. Omit optional query fields instead of sending null. Request bodies are limited to 1 MiB. JSON successes use a data envelope; PDF and CSV downloads return native content. Records contain untrusted user content. The schemas describe input shapes; the server also checks cross-field relationships, ownership and other business rules. HEAD is supported for GET endpoints. No cross-origin browser access is enabled.",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Folio access token, shown once when created. Read tokens can use all read operations, including previews; write tokens can use every operation." } },
      schemas: {
        Result: { type: "object", required: ["data"], additionalProperties: false, properties: { data: { description: "Operation result. Its shape depends on the endpoint." } } },
        Error: {
          type: "object", required: ["error"], additionalProperties: false,
          properties: { error: { type: "object", required: ["code", "message"], additionalProperties: false, properties: { code: { type: "string" }, message: { type: "string" } } } },
        },
      },
    },
  };
}
