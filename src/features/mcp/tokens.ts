import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { db, newId, nowIso } from "@/lib/db";

export const createMcpTokenSchema = z.object({
  label: z.string().trim().min(1, "Enter a name for this connection.").max(80),
  access: z.enum(["read", "write"]).default("read"),
  expiryDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(30),
});

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listMcpTokens(businessId: string) {
  return db
    .selectFrom("mcp_access_tokens")
    .select(["id", "label", "access", "token_prefix", "created_at", "expires_at", "revoked_at"])
    .where("business_id", "=", businessId)
    .orderBy("created_at", "desc")
    .execute();
}

export type McpTokenSummary = Awaited<ReturnType<typeof listMcpTokens>>[number];

export async function createMcpToken(
  businessId: string,
  input: z.input<typeof createMcpTokenSchema>,
) {
  const parsed = createMcpTokenSchema.parse(input);
  const token = `folio_mcp_${randomBytes(32).toString("base64url")}`;
  const createdAt = new Date();
  const id = newId();
  const expiresAt = new Date(createdAt.getTime() + parsed.expiryDays * 86_400_000);
  await db.insertInto("mcp_access_tokens").values({
    id,
    business_id: businessId,
    label: parsed.label,
    access: parsed.access,
    token_hash: hashMcpToken(token),
    token_prefix: token.slice(0, 18),
    created_at: nowIso(createdAt),
    expires_at: nowIso(expiresAt),
    revoked_at: null,
  }).execute();
  return { id, token };
}

export async function revokeMcpToken(businessId: string, tokenId: string) {
  await db
    .updateTable("mcp_access_tokens")
    .set({ revoked_at: nowIso() })
    .where("id", "=", tokenId)
    .where("business_id", "=", businessId)
    .where("revoked_at", "is", null)
    .execute();
}
