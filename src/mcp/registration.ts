import type { ContentBlock, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { debugLog } from "@/lib/logger";

import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

export type ReadTool = (name: string, input: Record<string, unknown>) => Promise<unknown>;

export function createToolRegistry(
  server: McpServer,
  context: McpContext,
  onMutation: () => void = () => {},
) {
  const readers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  const register: ToolRegistrar = (name, config, handler) => {
    if (!config.readOnly && context.access !== "write") return;
    const schema = z.object(config.inputSchema).strict();
    if (config.readOnly) readers.set(name, (input) => handler(schema.parse(input)));

    server.registerTool(name, {
      description: config.description,
      inputSchema: schema,
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: config.readOnly ?? false,
        destructiveHint: config.destructive ?? !config.readOnly,
        idempotentHint: config.idempotent ?? config.readOnly ?? false,
        openWorldHint: config.openWorld ?? false,
      },
    }, async (input) => {
      try {
        const result = await handler(input);
        if (!config.readOnly) {
          // Cache invalidation must not turn a committed write into a retryable error.
          try { onMutation(); } catch { debugLog("mcp.cache.error"); }
        }
        const output = { result: result ?? null };
        const content: ContentBlock[] = [{ type: "text", text: JSON.stringify(output) }];
        if (result && typeof result === "object" && "uri" in result && "filename" in result && "mimeType" in result
          && typeof result.uri === "string" && result.uri.startsWith("folio://")
          && typeof result.filename === "string" && typeof result.mimeType === "string") {
          content.push({ type: "resource_link", uri: result.uri, name: result.filename, mimeType: result.mimeType });
        }
        return {
          content,
          structuredContent: output,
        };
      } catch (error) {
        const detail = error instanceof McpToolError
          ? { code: error.code.toUpperCase(), message: error.message }
          : error instanceof z.ZodError
            ? { code: "INVALID_INPUT", message: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }
            : { code: "INTERNAL_ERROR", message: "Folio could not complete this operation. Check the record before retrying a write." };
        if (detail.code === "INTERNAL_ERROR") debugLog("mcp.tool.error");
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: detail }) }] };
      }
    });
  };
  const read: ReadTool = async (name, input) => {
    const reader = readers.get(name);
    if (!reader) throw new McpToolError("NOT_FOUND", "This resource is unavailable.");
    return reader(input);
  };
  return { register, read };
}
