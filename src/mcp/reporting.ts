import { z } from "zod";

import {
  settingsBusinessProfileSchema,
  toBusinessProfileUpdate,
} from "@/features/business/profile";
import { getDashboardSummary, getDashboardUpdates } from "@/features/dashboard/queries";
import { loadFinancialEntries } from "@/features/finance/ledger";
import { paymentMethodLabels } from "@/features/payments/types";
import { renderFinancialEntriesCsv } from "@/features/reports/csv";
import { getFinancialSummary, getReportInsights } from "@/features/reports/queries";
import { defaultReportRange, type DateRange } from "@/features/reports/range";
import { searchFolio } from "@/features/search/queries";
import { COUNTRIES } from "@/lib/countries";
import { INVOICE_CURRENCIES, INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { db, nowIso } from "@/lib/db";
import type { Business } from "@/lib/db/types";
import { getExchangeRate } from "@/lib/exchange-rates";
import { todayInTimeZone } from "@/lib/format";
import { isIsoDate } from "@/lib/iso-date";
import { SUPPORTED_TIMEZONES } from "@/lib/timezones";

import { imageDataUrlSchema } from "./images";
import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

const dateSchema = z.string().refine(isIsoDate, "Use a valid YYYY-MM-DD calendar date.");
const rangeShape = {
  from: dateSchema.optional().describe("Inclusive first date; defaults to 1 January in the business timezone."),
  to: dateSchema.optional().describe("Inclusive last date; defaults to today in the business timezone."),
};
const paginationShape = {
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(100).default(50),
};
const entryShape = {
  ...rangeShape,
  ...paginationShape,
  kind: z.enum(["sale", "receipt", "expense"]).optional(),
};
const currencySchema = z.string().trim().toUpperCase().refine(
  (code) => INVOICE_CURRENCY_CODES.has(code),
  "Choose a supported invoice currency from folio_reference_data.",
);

function reportRange(input: { from?: string; to?: string }, business: Business): DateRange {
  const fallback = defaultReportRange(todayInTimeZone(business.timezone));
  const range = { from: input.from ?? fallback.from, to: input.to ?? fallback.to };
  if (range.from > range.to) {
    throw new McpToolError("INVALID_INPUT", "The first date must be on or before the last date.");
  }
  return range;
}

function businessSettings(business: Business) {
  return {
    id: business.id,
    name: business.name,
    legalName: business.legal_name,
    email: business.email,
    phone: business.phone,
    taxId: business.tax_id,
    addressLine1: business.address_line_1,
    addressLine2: business.address_line_2,
    city: business.city,
    region: business.region,
    postalCode: business.postal_code,
    countryCode: business.country_code,
    currency: business.currency,
    timezone: business.timezone,
    invoicePrefix: business.invoice_prefix,
    paymentTermsDays: business.default_payment_terms_days,
    paymentInstructions: business.payment_instructions,
    invoiceFooter: business.invoice_footer,
    nextInvoiceNumber: business.next_invoice_number,
    updatedAt: business.updated_at,
  };
}

async function currentBusiness(context: McpContext): Promise<Business> {
  const business = await db.selectFrom("businesses").selectAll()
    .where("id", "=", context.business.id).executeTakeFirst();
  if (!business) throw new McpToolError("NOT_FOUND", "The business was not found.");
  return business;
}

async function financialEntryPage(
  input: z.output<z.ZodObject<typeof entryShape>>,
  context: McpContext,
) {
  const range = reportRange(input, context.business);
  const entries = (await loadFinancialEntries({
    businessId: context.business.id,
    baseCurrency: context.business.currency,
    range,
  })).filter((entry) => !input.kind || entry.kind === input.kind)
    .sort((left, right) => left.date.localeCompare(right.date)
      || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const page = entries.slice(input.offset, input.offset + input.limit);
  return {
    range,
    baseCurrency: context.business.currency,
    entries: page,
    total: entries.length,
    offset: input.offset,
    limit: input.limit,
    nextOffset: input.offset + page.length < entries.length ? input.offset + page.length : null,
  };
}

export function registerReportingTools(register: ToolRegistrar, context: McpContext): void {
  register("folio_dashboard_summary", {
    description: "Get sales, receipts, expenses and cash net income for a date range, plus current outstanding invoices and customer totals. Amounts are integer hundredths of the business currency. Missing currency conversions are counted, never treated as zero.",
    inputSchema: rangeShape,
    readOnly: true,
  }, async (input) => {
    const range = reportRange(input, context.business);
    const asOf = todayInTimeZone(context.business.timezone);
    return {
      range,
      asOf,
      baseCurrency: context.business.currency,
      summary: await getDashboardSummary(context.business.id, range, context.business.currency, asOf),
    };
  });

  register("folio_recent_activity", {
    description: "Get the five latest business activity events and five recent invoices, including derived payment status. Activity covers customer creation, invoice creation, receipts and expenses.",
    inputSchema: {},
    readOnly: true,
  }, async () => getDashboardUpdates(context.business.id, todayInTimeZone(context.business.timezone)));

  register("folio_financial_summary", {
    description: "Summarise issued sales, cash receipts, expenses and cash net income for an inclusive date range. Amounts are integer hundredths of the business currency. Sales and receipts are separate measures; missing conversions are explicitly counted.",
    inputSchema: rangeShape,
    readOnly: true,
  }, async (input) => {
    const range = reportRange(input, context.business);
    return {
      range,
      baseCurrency: context.business.currency,
      summary: await getFinancialSummary(context.business.id, range, context.business.currency),
    };
  });

  register("folio_report_insights", {
    description: "Get a financial report with totals, bounded time-series buckets, transaction counts and the top 50 expense categories. Totals include all categories; missing currency conversions are excluded and counted in the summary.",
    inputSchema: rangeShape,
    readOnly: true,
  }, async (input) => {
    const range = reportRange(input, context.business);
    const insights = await getReportInsights(context.business.id, range, context.business.currency);
    return {
      range,
      baseCurrency: context.business.currency,
      ...insights,
      expenseCategories: insights.expenseCategories.slice(0, 50),
      expenseCategoryCount: insights.expenseCategories.length,
      expenseCategoriesTruncated: insights.expenseCategories.length > 50,
    };
  });

  register("folio_financial_entries", {
    description: "List financial ledger entries, including original amounts and stored conversion provenance. Paginated by offset, ordered by date, kind and ID ascending, with at most 100 entries per call. Use nextOffset to continue; underlying records can change between calls.",
    inputSchema: entryShape,
    readOnly: true,
  }, async (input) => financialEntryPage(input, context));

  register("folio_export_report_csv", {
    description: "Export one page of up to 100 ledger entries as CSV text, with a header, currency-conversion provenance and spreadsheet formula escaping. Use nextOffset for subsequent pages. Each page is limited to 256 KiB; request fewer rows if the output is too large.",
    inputSchema: entryShape,
    readOnly: true,
  }, async (input) => {
    const { entries, ...page } = await financialEntryPage(input, context);
    const csv = renderFinancialEntriesCsv(entries, page.baseCurrency);
    if (Buffer.byteLength(csv, "utf8") > 256 * 1024) {
      throw new McpToolError("OUTPUT_TOO_LARGE", "This CSV page exceeds 256 KiB. Reduce limit and retry.");
    }
    return {
      ...page,
      rowCount: entries.length,
      filename: `folio-report-${page.range.from}-${page.range.to}-${page.offset}.csv`,
      mimeType: "text/csv; charset=utf-8",
      csv,
    };
  });

  register("folio_search", {
    description: "Search customers, invoices, recurring schedules, items, payments and expenses in this business. Returns at most six matches per entity type, including archived customers and items. Use entity list tools for exhaustive results.",
    inputSchema: { query: z.string().trim().min(1).max(200) },
    readOnly: true,
  }, async ({ query }) => ({ groups: await searchFolio(context.business.id, query) }));

  register("folio_reference_data", {
    description: "List supported currencies, countries, timezones or payment methods. Optionally filter by code/name and paginate. Use these exact codes when creating or updating records.",
    inputSchema: {
      kind: z.enum(["currencies", "countries", "timezones", "payment_methods"]),
      query: z.string().trim().max(100).optional(),
      ...paginationShape,
    },
    readOnly: true,
  }, async ({ kind, query, offset, limit }) => {
    const choices = kind === "currencies" ? INVOICE_CURRENCIES
      : kind === "countries" ? COUNTRIES
      : kind === "timezones" ? SUPPORTED_TIMEZONES.map((code) => ({ code, name: code.replaceAll("_", " ") }))
      : Object.entries(paymentMethodLabels).map(([code, name]) => ({ code, name }));
    const term = query?.toLowerCase();
    const matches = choices.filter(({ code, name }) => !term || `${code} ${name}`.toLowerCase().includes(term));
    const items = matches.slice(offset, offset + limit);
    return { kind, items, total: matches.length, offset, limit, nextOffset: offset + items.length < matches.length ? offset + items.length : null };
  });

  register("folio_get_exchange_rate", {
    description: "Look up a public exchange rate from Frankfurter, preferring the ECB. base is the source currency and quote the destination currency. rateMicros / 1,000,000 is the multiplier. Date is optional; the returned date may be an earlier trading day. The lookup does not change stored invoice or payment rates.",
    inputSchema: { base: currencySchema, quote: currencySchema, date: dateSchema.optional() },
    readOnly: true,
    openWorld: true,
  }, async ({ base, quote, date }) => getExchangeRate(base, quote, date));

  register("folio_get_business_settings", {
    description: "Get the current business profile, invoice defaults and next invoice number. Does not expose login credentials or logo data.",
    inputSchema: {},
    readOnly: true,
  }, async () => businessSettings(await currentBusiness(context)));

  register("folio_get_business_logo", {
    description: "Get the business logo as a base64 image data URL, or null if none is configured. Images are limited to 512 KB decoded. Use folio_get_business_settings for the compact business profile.",
    inputSchema: {},
    readOnly: true,
  }, async () => {
    const business = await currentBusiness(context);
    return { businessId: business.id, dataUrl: business.logo_url };
  });

  register("folio_set_business_logo", {
    description: "Replace the business logo with a PNG, JPEG or WebP data URL of at most 512 KB decoded, or pass null to remove it. Changes apply to the business branding used by invoice PDFs.",
    inputSchema: { dataUrl: imageDataUrlSchema.nullable().describe("New image data URL, or null to remove the business logo.") },
    idempotent: true,
  }, async ({ dataUrl }) => {
    const updated = await db.updateTable("businesses")
      .set({ logo_url: dataUrl, updated_at: nowIso() })
      .where("id", "=", context.business.id)
      .returningAll().executeTakeFirst();
    if (!updated) throw new McpToolError("NOT_FOUND", "The business was not found.");
    context.business = updated;
    return { businessId: updated.id, hasLogo: updated.logo_url !== null, updatedAt: updated.updated_at };
  });

  register("folio_update_business_settings", {
    description: "Partially update the business profile and invoice defaults; omitted fields are preserved. Use an empty string to clear optional text. Changes affect future documents; existing invoice snapshots remain unchanged. Currency changes can cause historical conversions to be unavailable. Cannot change account credentials, logo or next invoice number.",
    inputSchema: settingsBusinessProfileSchema.partial().shape,
    idempotent: true,
  }, async (input) => {
    if (Object.keys(input).length === 0) {
      throw new McpToolError("INVALID_INPUT", "Provide at least one business setting to update.");
    }
    const business = await currentBusiness(context);
    const merged = Object.fromEntries(Object.entries({ ...businessSettings(business), ...input })
      .map(([key, value]) => [key, value ?? ""]));
    const profile = settingsBusinessProfileSchema.parse(merged);
    const update = toBusinessProfileUpdate(profile);
    const changes = Object.fromEntries(Object.entries(update)
      .filter(([key, value]) => value !== business[key as keyof Business]));
    const updated = await db.updateTable("businesses")
      .set({ ...changes, updated_at: nowIso() })
      .where("id", "=", context.business.id)
      .returningAll().executeTakeFirst();
    if (!updated) throw new McpToolError("NOT_FOUND", "The business was not found.");
    context.business = updated;
    return businessSettings(updated);
  });
}
