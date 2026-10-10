import { sql } from "kysely";
import { z } from "zod";

import { customerSchema } from "@/features/customers/schema";
import { itemFormSchema } from "@/features/items/schema";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { db, newId, nowIso } from "@/lib/db";
import { likeContainsPattern } from "@/lib/db/like";

import { imageDataUrlSchema } from "./images";
import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

const idSchema = z.string().uuid().describe("The record UUID returned by Folio.");
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const currencySchema = z.string().trim().length(3).toUpperCase()
  .refine((currency) => INVOICE_CURRENCY_CODES.has(currency), "Choose a supported currency.");
const pageFields = {
  q: z.string().trim().max(100).default("").describe("Literal, case-insensitive text search; % and _ are not wildcards."),
  status: z.enum(["active", "archived", "all"]).default("active"),
  page: z.number().int().min(1).max(10_000).default(1),
  limit: z.number().int().min(1).max(100).default(25),
};
const customerFields = {
  name: z.string().trim().min(1).max(160),
  billing_name: nullableText(160),
  contact_name: nullableText(160),
  email: nullableText(254),
  phone: nullableText(40),
  tax_id: nullableText(80),
  address_line_1: nullableText(200),
  address_line_2: nullableText(200),
  city: nullableText(120),
  region: nullableText(120),
  postal_code: nullableText(32),
  country_code: nullableText(2).describe("ISO two-letter country code, or null to clear."),
  default_currency: currencySchema.nullable().optional(),
  notes: nullableText(2_000),
};
const customerDefaults = {
  billing_name: null, contact_name: null, email: null, phone: null, tax_id: null,
  address_line_1: null, address_line_2: null, city: null, region: null,
  postal_code: null, country_code: null, default_currency: null, notes: null,
};
const customerColumns = [
  "id", "name", "billing_name", "contact_name", "email", "phone", "tax_id",
  "address_line_1", "address_line_2", "city", "region", "postal_code",
  "country_code", "default_currency", "notes", "archived_at", "created_at", "updated_at",
] as const;
const itemFields = {
  name: z.string().trim().min(1).max(120),
  description: nullableText(1_000),
  unit: z.string().trim().min(1).max(40).describe("Unit label, for example hour, day or item."),
  unit_price_cents: z.number().int().min(0).max(2_147_483_647).describe("Unit price in hundredths of the currency; 1250 means 12.50."),
  tax_rate_bps: z.number().int().min(0).max(10_000).describe("Tax in basis points; 2000 means 20%."),
  currency: currencySchema,
};
const itemWriteSchema = z.object(itemFields);
const customerPatchSchema = z.object(customerFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
const itemPatchSchema = itemWriteSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

function itemValues(input: z.output<typeof itemWriteSchema>) {
  const parsed = itemFormSchema.parse({
    name: input.name,
    description: input.description ?? "",
    unit: input.unit,
    unitPrice: (input.unit_price_cents / 100).toFixed(2),
    taxRate: (input.tax_rate_bps / 100).toFixed(2),
    currency: input.currency,
  });
  return {
    name: parsed.name, description: parsed.description, unit: parsed.unit,
    unit_price_cents: parsed.unitPrice, tax_rate_bps: parsed.taxRate, currency: parsed.currency,
  };
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) };
}

export function registerCatalogueTools(register: ToolRegistrar, context: McpContext) {
  const businessId = context.business.id;
  const customers = () => db.selectFrom("customers").where("business_id", "=", businessId);
  const items = () => db.selectFrom("items").where("business_id", "=", businessId);
  const customerSelection = () => customers().select(customerColumns)
    .select(sql<number>`case when avatar_data_url is null then 0 else 1 end`.as("has_avatar"));
  const getCustomer = async (id: string) => {
    const row = await customerSelection().where("id", "=", id).executeTakeFirst();
    if (!row) throw new McpToolError("NOT_FOUND", "Customer not found.");
    return { ...row, has_avatar: Boolean(row.has_avatar) };
  };
  const getItem = async (id: string) => {
    const row = await items().selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) throw new McpToolError("NOT_FOUND", "Item not found.");
    return row;
  };

  register("folio_list_customers", {
    description: "List the authenticated business's customers. Search name, billing/contact name, email or phone. Defaults to active records. Images are excluded; use folio_get_customer_avatar.",
    inputSchema: pageFields, readOnly: true,
  }, async ({ q, status, page, limit }) => {
    let query = customerSelection();
    if (status === "active") query = query.where("archived_at", "is", null);
    if (status === "archived") query = query.where("archived_at", "is not", null);
    if (q) {
      const pattern = likeContainsPattern(q.toLowerCase());
      query = query.where(sql<boolean>`(
        lower(name) like ${pattern} escape '!'
        or lower(coalesce(billing_name, '')) like ${pattern} escape '!'
        or lower(coalesce(contact_name, '')) like ${pattern} escape '!'
        or lower(coalesce(email, '')) like ${pattern} escape '!'
        or lower(coalesce(phone, '')) like ${pattern} escape '!'
      )`);
    }
    const [rows, count] = await Promise.all([
      query.orderBy("name").orderBy("id").limit(limit).offset((page - 1) * limit).execute(),
      query.clearSelect().select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
    ]);
    return { customers: rows.map((row) => ({ ...row, has_avatar: Boolean(row.has_avatar) })), pagination: pagination(page, limit, Number(count.total)) };
  });

  register("folio_get_customer", {
    description: "Read a customer, including archived customers. Avatar data is excluded; has_avatar indicates whether one is stored.",
    inputSchema: { id: idSchema }, readOnly: true,
  }, async ({ id }) => getCustomer(id));

  register("folio_create_customer", {
    description: "Create a customer in the authenticated business. Only name is required; omitted optional fields become null. Use folio_set_customer_avatar to attach an image.",
    inputSchema: customerFields,
  }, async (input) => {
    const values = customerSchema.parse({ ...customerDefaults, ...input });
    const id = newId();
    const timestamp = nowIso();
    await db.insertInto("customers").values({
      ...values, id, business_id: businessId, avatar_data_url: null,
      archived_at: null, created_at: timestamp, updated_at: timestamp,
    }).executeTakeFirstOrThrow();
    return getCustomer(id);
  });

  register("folio_update_customer", {
    description: "Patch a customer. Omitted fields are preserved; null or an empty optional text clears that field. Existing issued invoices retain their customer snapshot.",
    inputSchema: { id: idSchema, changes: customerPatchSchema }, idempotent: true,
  }, async ({ id, changes }) => {
    const existing = await getCustomer(id);
    const values = customerSchema.parse({ ...existing, ...changes });
    const updates = Object.fromEntries(Object.keys(changes).map((key) => [key, values[key as keyof typeof values]]));
    await db.updateTable("customers").set({ ...updates, updated_at: nowIso() })
      .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
    return getCustomer(id);
  });

  for (const archived of [true, false]) {
    register(`folio_${archived ? "archive" : "restore"}_customer`, {
      description: archived
        ? "Archive a customer so it is excluded from active customer selection. Existing invoices are preserved. Already archived customers are unchanged."
        : "Restore an archived customer to active customer selection. Already active customers are unchanged.",
      inputSchema: { id: idSchema }, idempotent: true,
    }, async ({ id }) => {
      const existing = await getCustomer(id);
      if (Boolean(existing.archived_at) !== archived) {
        const timestamp = nowIso();
        await db.updateTable("customers").set({ archived_at: archived ? timestamp : null, updated_at: timestamp })
          .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
      }
      return getCustomer(id);
    });
  }

  register("folio_get_customer_avatar", {
    description: "Read a customer's stored avatar as a data URL, or null if absent. The decoded image is at most 512 KB.",
    inputSchema: { id: idSchema }, readOnly: true,
  }, async ({ id }) => {
    const row = await customers().select(["id", "avatar_data_url"]).where("id", "=", id).executeTakeFirst();
    if (!row) throw new McpToolError("NOT_FOUND", "Customer not found.");
    return row;
  });

  register("folio_set_customer_avatar", {
    description: "Replace a customer's avatar with a PNG, JPEG or WebP base64 data URL up to 512 KB, or pass null to remove it.",
    inputSchema: { id: idSchema, data_url: imageDataUrlSchema.nullable() }, idempotent: true,
  }, async ({ id, data_url }) => {
    await getCustomer(id);
    await db.updateTable("customers").set({ avatar_data_url: data_url, updated_at: nowIso() })
      .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
    return getCustomer(id);
  });

  register("folio_list_items", {
    description: "List the authenticated business's reusable invoice items. Search name and description; optionally filter currency. Prices are integer hundredths and tax rates are basis points.",
    inputSchema: { ...pageFields, currency: currencySchema.optional() }, readOnly: true,
  }, async ({ q, status, page, limit, currency }) => {
    let query = items();
    if (status === "active") query = query.where("archived_at", "is", null);
    if (status === "archived") query = query.where("archived_at", "is not", null);
    if (currency) query = query.where("currency", "=", currency);
    if (q) {
      const pattern = likeContainsPattern(q.toLowerCase());
      query = query.where(sql<boolean>`(lower(name) like ${pattern} escape '!' or lower(coalesce(description, '')) like ${pattern} escape '!')`);
    }
    const [rows, count] = await Promise.all([
      query.selectAll().orderBy("name").orderBy("id").limit(limit).offset((page - 1) * limit).execute(),
      query.select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
    ]);
    return { items: rows, pagination: pagination(page, limit, Number(count.total)) };
  });

  register("folio_get_item", {
    description: "Read a reusable item, including archived items. unit_price_cents is integer hundredths; tax_rate_bps is basis points.",
    inputSchema: { id: idSchema }, readOnly: true,
  }, async ({ id }) => getItem(id));

  register("folio_create_item", {
    description: "Create a reusable invoice item. Price is integer hundredths (1250 = 12.50); tax is basis points (2000 = 20%). Tax defaults to zero.",
    inputSchema: { ...itemFields, tax_rate_bps: itemFields.tax_rate_bps.default(0) },
  }, async (input) => {
    const values = itemValues(input);
    const id = newId();
    const timestamp = nowIso();
    await db.insertInto("items").values({
      ...values, id, business_id: businessId, archived_at: null, created_at: timestamp, updated_at: timestamp,
    }).executeTakeFirstOrThrow();
    return getItem(id);
  });

  register("folio_update_item", {
    description: "Patch a reusable item, preserving omitted fields. Pass null to clear description. Existing invoice lines retain their snapshots. Prices are integer hundredths; tax rates are basis points.",
    inputSchema: { id: idSchema, changes: itemPatchSchema }, idempotent: true,
  }, async ({ id, changes }) => {
    const existing = await getItem(id);
    const values = itemValues({ ...existing, ...changes });
    const updates = Object.fromEntries(Object.keys(changes).map((key) => [key, values[key as keyof typeof values]]));
    await db.updateTable("items").set({ ...updates, updated_at: nowIso() })
      .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
    return getItem(id);
  });

  for (const archived of [true, false]) {
    register(`folio_${archived ? "archive" : "restore"}_item`, {
      description: archived
        ? "Archive a reusable item, removing it from active item selection while preserving existing invoice lines. Already archived items are unchanged."
        : "Restore an archived reusable item to active item selection. Already active items are unchanged.",
      inputSchema: { id: idSchema }, idempotent: true,
    }, async ({ id }) => {
      const existing = await getItem(id);
      if (Boolean(existing.archived_at) !== archived) {
        const timestamp = nowIso();
        await db.updateTable("items").set({ archived_at: archived ? timestamp : null, updated_at: timestamp })
          .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
      }
      return getItem(id);
    });
  }
}
