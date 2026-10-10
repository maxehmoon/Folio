import { z } from "zod";

import { registerFolioTools } from "@/mcp/tools";
import type { McpContext, ToolRegistrar } from "@/mcp/types";

export type ApiOperation = {
  schema: z.ZodObject<z.ZodRawShape>;
  description: string;
  readOnly: boolean;
  run: (input: unknown) => Promise<unknown>;
};

export function createApiOperations(context: McpContext): Map<string, ApiOperation> {
  const operations = new Map<string, ApiOperation>();
  const register: ToolRegistrar = (name, config, handler) => {
    const schema = z.object(config.inputSchema).strict();
    operations.set(name.replace(/^folio_/, ""), {
      schema,
      description: config.description,
      readOnly: config.readOnly === true,
      run: async (input) => handler(schema.parse(input)),
    });
  };
  registerFolioTools(register, context);
  return operations;
}
