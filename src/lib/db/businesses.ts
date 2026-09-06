import { sql } from "kysely";

import { db, newId, nowIso, type DatabaseExecutor } from "./index";
import type { Business, BusinessUpdate } from "./types";

export interface EnsureBusinessInput {
  userId: string;
  name: string;
  email: string;
  currency?: string;
  timezone?: string;
  profile?: BusinessProfileUpdate;
}

export type BusinessProfileUpdate = Partial<
  Pick<
    Business,
    | "name"
    | "legal_name"
    | "email"
    | "phone"
    | "tax_id"
    | "address_line_1"
    | "address_line_2"
    | "city"
    | "region"
    | "postal_code"
    | "country_code"
    | "currency"
    | "timezone"
    | "invoice_prefix"
    | "default_payment_terms_days"
    | "payment_instructions"
    | "invoice_footer"
    | "logo_url"
  >
>;

export async function getBusinessByOwnerId(
  ownerUserId: string,
): Promise<Business | null> {
  return (
    (await db
      .selectFrom("businesses")
      .selectAll()
      .where("owner_user_id", "=", ownerUserId)
      .executeTakeFirst()) ?? null
  );
}

export async function ensureBusinessForUser(
  input: EnsureBusinessInput,
): Promise<Business> {
  const timestamp = nowIso();
  const profile = input.profile ?? {};
  const name = profile.name?.trim() || input.name.trim() || "My business";

  await db
    .insertInto("businesses")
    .values({
      id: newId(),
      owner_user_id: input.userId,
      name,
      legal_name: profile.legal_name ?? null,
      email: profile.email?.trim() || input.email.trim(),
      phone: profile.phone ?? null,
      tax_id: profile.tax_id ?? null,
      address_line_1: profile.address_line_1 ?? null,
      address_line_2: profile.address_line_2 ?? null,
      city: profile.city ?? null,
      region: profile.region ?? null,
      postal_code: profile.postal_code ?? null,
      country_code: profile.country_code ?? null,
      currency: (profile.currency ?? input.currency ?? "USD").toUpperCase(),
      timezone: profile.timezone ?? input.timezone ?? "UTC",
      invoice_prefix: profile.invoice_prefix ?? "INV",
      next_invoice_number: 1,
      default_payment_terms_days: profile.default_payment_terms_days ?? 14,
      payment_instructions: profile.payment_instructions ?? null,
      invoice_footer: profile.invoice_footer ?? null,
      logo_url: profile.logo_url ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .onConflict((conflict) => conflict.column("owner_user_id").doNothing())
    .execute();

  const business = await getBusinessByOwnerId(input.userId);
  if (!business) throw new Error("The business could not be created.");
  return business;
}

export async function updateBusinessForOwner(
  ownerUserId: string,
  update: BusinessProfileUpdate,
): Promise<Business | null> {
  const values: BusinessUpdate = { ...update, updated_at: nowIso() };
  return (
    (await db
      .updateTable("businesses")
      .set(values)
      .where("owner_user_id", "=", ownerUserId)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function allocateInvoiceNumber(
  executor: DatabaseExecutor,
  businessId: string,
): Promise<string> {
  const updated = await executor
    .updateTable("businesses")
    .set({
      next_invoice_number: sql<number>`next_invoice_number + 1`,
      updated_at: nowIso(),
    })
    .where("id", "=", businessId)
    .returning(["invoice_prefix", "next_invoice_number"])
    .executeTakeFirst();

  if (!updated) throw new Error("Business not found.");
  const number = updated.next_invoice_number - 1;
  const serial = number.toString().padStart(6, "0");
  return updated.invoice_prefix ? `${updated.invoice_prefix}-${serial}` : serial;
}
