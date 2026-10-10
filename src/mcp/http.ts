import { createMcpHandler } from "@modelcontextprotocol/server";

import { debugLog } from "@/lib/logger";
import { requestPublicOrigin } from "@/lib/runtime-config";

import { authenticateMcpRequest } from "./auth";
import { createFolioMcpServer } from "./server";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function handleMcpRequest(request: Request, onMutation?: () => void): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== requestPublicOrigin(request)) {
    return Response.json({ error: "Origin is not permitted." }, { status: 403, headers: privateHeaders });
  }
  // Credentials in URLs leak through logs and must never select a principal.
  if (new URL(request.url).search) {
    return Response.json({ error: "Use the Authorization header; query parameters are not supported." }, { status: 400, headers: privateHeaders });
  }
  try {
    const context = await authenticateMcpRequest(request);
    if (!context) {
      return Response.json({ error: "A valid Folio MCP access token is required." }, {
        status: 401,
        headers: { ...privateHeaders, "WWW-Authenticate": 'Bearer realm="Folio MCP"' },
      });
    }
    const handler = createMcpHandler(() => createFolioMcpServer(context, onMutation), {
      legacy: "stateless",
      responseMode: "json",
      maxRequestBodySize: 1024 * 1024,
      maxSubscriptions: 0,
      onerror: () => debugLog("mcp.protocol.error"),
    });
    try {
      const response = await handler.fetch(request);
      // Folio emits only terminal results. Consume legacy SSE before closing its
      // per-request handler, so no transport or subscription outlives this request.
      const body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(privateHeaders)) headers.set(key, value);
      return new Response(body.byteLength ? body : null, { status: response.status, headers });
    } finally {
      await handler.close();
    }
  } catch {
    debugLog("mcp.request.error");
    return Response.json({ error: "Folio could not process the MCP request." }, { status: 500, headers: privateHeaders });
  }
}
