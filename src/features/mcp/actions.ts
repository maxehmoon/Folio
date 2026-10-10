"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireBusiness } from "@/lib/session";

import { createMcpToken, createMcpTokenSchema, revokeMcpToken } from "./tokens";

export type McpTokenFormState = {
  error?: string;
  created?: { id: string; token: string };
};

export async function createMcpTokenAction(
  _previous: McpTokenFormState,
  formData: FormData,
): Promise<McpTokenFormState> {
  const business = await requireBusiness();
  const parsed = createMcpTokenSchema.safeParse({
    label: formData.get("label"),
    access: formData.get("access") ?? "read",
    expiryDays: Number(formData.get("expiryDays") ?? 30),
  });
  if (!parsed.success) {
    return { error: "Enter a connection name (up to 80 characters), access level and expiry." };
  }
  const created = await createMcpToken(business.id, parsed.data);
  revalidatePath("/settings");
  return { created };
}

export async function revokeMcpTokenAction(tokenId: string): Promise<void> {
  const business = await requireBusiness();
  const parsed = z.uuid().safeParse(tokenId);
  if (!parsed.success) throw new Error("Invalid connection.");
  await revokeMcpToken(business.id, parsed.data);
  revalidatePath("/settings");
}
