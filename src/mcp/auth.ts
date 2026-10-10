import "server-only";

import { hashMcpToken } from "@/features/mcp/tokens";
import { db, nowIso } from "@/lib/db";

import type { McpContext } from "./types";

export async function authenticateMcpRequest(request: Request): Promise<McpContext | null> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer (folio_mcp_[A-Za-z0-9_-]{43})$/i);
  if (!match) return null;

  const result = await db
    .selectFrom("mcp_access_tokens")
    .innerJoin("businesses", "businesses.id", "mcp_access_tokens.business_id")
    .selectAll("businesses")
    .select("mcp_access_tokens.access as token_access")
    .where("mcp_access_tokens.token_hash", "=", hashMcpToken(match[1]))
    .where("mcp_access_tokens.revoked_at", "is", null)
    .where("mcp_access_tokens.expires_at", ">", nowIso())
    .executeTakeFirst();
  if (!result) return null;

  const { token_access: access, ...business } = result;
  return { business, userId: business.owner_user_id, access };
}
