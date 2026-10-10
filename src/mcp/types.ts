import type { z } from "zod";

import type { Business } from "@/lib/db/types";

export type McpContext = {
  business: Business;
  userId: string;
  access: "read" | "write";
};

export type ToolRegistrar = <Shape extends z.ZodRawShape>(
  name: string,
  config: {
    description: string;
    inputSchema: Shape;
    readOnly?: boolean;
    destructive?: boolean;
    idempotent?: boolean;
    openWorld?: boolean;
  },
  handler: (input: z.output<z.ZodObject<Shape>>) => Promise<unknown>,
) => void;

/** Only intentional domain errors may be shown to an MCP client. */
export class McpToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "McpToolError";
  }
}
