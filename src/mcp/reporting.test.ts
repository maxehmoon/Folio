import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { getDashboardSummary, getDashboardUpdates } from "@/features/dashboard/queries";
import { loadFinancialEntries, type FinancialEntry } from "@/features/finance/ledger";
import { getFinancialSummary, getReportInsights } from "@/features/reports/queries";
import { searchFolio } from "@/features/search/queries";
import type { Business, Database } from "@/lib/db/types";
import { getExchangeRate } from "@/lib/exchange-rates";

import { registerReportingTools } from "./reporting";
import type { McpContext, ToolRegistrar } from "./types";

vi.mock("@/features/dashboard/queries", () => ({ getDashboardSummary: vi.fn(), getDashboardUpdates: vi.fn() }));
vi.mock("@/features/finance/ledger", () => ({ loadFinancialEntries: vi.fn() }));
vi.mock("@/features/reports/queries", () => ({ getFinancialSummary: vi.fn(), getReportInsights: vi.fn() }));
vi.mock("@/features/search/queries", () => ({ searchFolio: vi.fn() }));
vi.mock("@/lib/exchange-rates", () => ({ getExchangeRate: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return database; }, nowIso: () => new Date().toISOString() }));

let database: Kysely<Database>;
let context: McpContext;
const tools = new Map<string, {
  config: Parameters<ToolRegistrar>[1];
  run: (input: unknown) => Promise<unknown>;
}>();
const business: Business = {
  id: "business-a", owner_user_id: "owner-a", name: "Folio Studio", legal_name: null,
  email: "hello@example.test", phone: "+44 123456789", tax_id: null,
  address_line_1: "1 High Street", address_line_2: null, city: "London", region: null,
  postal_code: "SW1A 1AA", country_code: "GB", currency: "GBP", timezone: "Europe/London",
  invoice_prefix: "INV", next_invoice_number: 42, default_payment_terms_days: 14,
  payment_instructions: "Bank transfer", invoice_footer: "Thank you", logo_url: "data:image/png;base64,secret",
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
};
const totals = { salesCents: 10000, receiptsCents: 5000, expensesCents: 2000, netIncomeCents: 3000, missingConversionCount: 1 };

function entry(id: string, changes: Partial<FinancialEntry> = {}): FinancialEntry {
  return {
    id, kind: "sale", date: "2026-02-01", reference: "INV-000001", party: "Example Ltd",
    description: "Consulting", amountCents: 10000, currency: "GBP",
    baseConversion: { status: "converted", amountCents: 10000 }, rateDate: null, rateSource: null,
    ...changes,
  };
}

async function call(name: string, input: unknown = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool ${name}`);
  return tool.run(input);
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-03T12:00:00Z"));
  database = new Kysely<Database>({ dialect: new SqliteDialect({ database: new BetterSqlite3(":memory:") }) });
  let schema = database.schema.createTable("businesses");
  for (const key of Object.keys(business)) {
    schema = schema.addColumn(key, key === "next_invoice_number" || key === "default_payment_terms_days" ? "integer" : "text");
  }
  await schema.execute();
  await database.insertInto("businesses").values([
    business,
    { ...business, id: "business-b", owner_user_id: "owner-b", name: "Other business" },
  ]).execute();
  context = { business: { ...business }, userId: "owner-a", access: "write" };
  tools.clear();
  const register: ToolRegistrar = (name, config, handler) => {
    tools.set(name, {
      config,
      run: async (input) => handler(z.object(config.inputSchema).strict().parse(input)),
    });
  };
  registerReportingTools(register, context);
  vi.mocked(loadFinancialEntries).mockResolvedValue([]);
  vi.mocked(getFinancialSummary).mockResolvedValue(totals);
});

afterEach(async () => {
  vi.useRealTimers();
  await database.destroy();
});

describe("MCP reporting tools", () => {
  it("marks reads and the external rate lookup accurately", () => {
    expect(tools.size).toBe(13);
    for (const [name, tool] of tools) {
      expect(tool.config.readOnly === true).toBe(!["folio_update_business_settings", "folio_set_business_logo"].includes(name));
    }
    expect(tools.get("folio_get_exchange_rate")?.config.openWorld).toBe(true);
    expect(tools.get("folio_update_business_settings")?.config.idempotent).toBe(true);
  });

  it("uses the business timezone for default reporting dates and current invoice statuses", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:30:00Z"));
    context.business.timezone = "America/Los_Angeles";
    vi.mocked(getDashboardSummary).mockResolvedValue({ ...totals, amountDueCents: 5000, dueInvoices: 1, missingAmountDueCount: 0, overdueInvoices: 0, totalCustomers: 1, totalInvoices: 1 });
    await expect(call("folio_dashboard_summary")).resolves.toMatchObject({
      range: { from: "2025-01-01", to: "2025-12-31" }, asOf: "2025-12-31", baseCurrency: "GBP",
    });
    expect(getDashboardSummary).toHaveBeenCalledWith("business-a", { from: "2025-01-01", to: "2025-12-31" }, "GBP", "2025-12-31");
    await call("folio_recent_activity");
    expect(getDashboardUpdates).toHaveBeenCalledWith("business-a", "2025-12-31");
  });

  it("preserves conversion warnings in summaries and scopes every report to the authenticated business", async () => {
    await expect(call("folio_financial_summary", { from: "2026-02-01", to: "2026-02-28" })).resolves.toEqual({
      range: { from: "2026-02-01", to: "2026-02-28" }, baseCurrency: "GBP", summary: totals,
    });
    expect(getFinancialSummary).toHaveBeenCalledWith("business-a", { from: "2026-02-01", to: "2026-02-28" }, "GBP");
    await expect(call("folio_financial_summary", { businessId: "business-b" })).rejects.toThrow();
  });

  it("rejects impossible and reversed dates before loading financial data", async () => {
    await expect(call("folio_financial_summary", { from: "2026-02-30" })).rejects.toThrow();
    await expect(call("folio_financial_summary", { from: "2026-03-02", to: "2026-03-01" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });

  it("paginates entries deterministically after filtering and retains missing conversion details", async () => {
    const missing = entry("a", { baseConversion: { status: "missing-rate", reason: "missing-rate" } });
    vi.mocked(loadFinancialEntries).mockResolvedValue([
      entry("z"), entry("expense", { kind: "expense" }), missing, entry("b"),
    ]);
    await expect(call("folio_financial_entries", { kind: "sale", limit: 2 })).resolves.toMatchObject({
      entries: [missing, entry("b")], total: 3, offset: 0, limit: 2, nextOffset: 2,
    });
    await expect(call("folio_financial_entries", { kind: "sale", limit: 2, offset: 2 })).resolves.toMatchObject({
      entries: [entry("z")], total: 3, nextOffset: null,
    });
    expect(loadFinancialEntries).toHaveBeenCalledWith({ businessId: "business-a", baseCurrency: "GBP", range: { from: "2026-01-01", to: "2026-03-03" } });
  });

  it("bounds page size and rejects negative offsets", async () => {
    await expect(call("folio_financial_entries", { limit: 101 })).rejects.toThrow();
    await expect(call("folio_financial_entries", { offset: -1 })).rejects.toThrow();
    expect(loadFinancialEntries).not.toHaveBeenCalled();
  });

  it("exports bounded CSV pages with spreadsheet formula escaping and conversion provenance", async () => {
    vi.mocked(loadFinancialEntries).mockResolvedValue([
      entry("a", { party: "=HYPERLINK(\"bad\")", rateDate: "2026-01-30", rateSource: "ECB" }), entry("b"),
    ]);
    const result = await call("folio_export_report_csv", { limit: 1 }) as { csv: string; nextOffset: number; rowCount: number };
    expect(result.rowCount).toBe(1);
    expect(result.nextOffset).toBe(1);
    expect(result.csv).toContain("'=");
    expect(result.csv).toContain('"2026-01-30","ECB"');
    expect(result.csv).toContain('"Base currency"');
    vi.mocked(loadFinancialEntries).mockResolvedValue([entry("a", { description: "x".repeat(256 * 1024) })]);
    await expect(call("folio_export_report_csv")).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
  });

  it("bounds expense category output while keeping full report totals", async () => {
    vi.mocked(getReportInsights).mockResolvedValue({
      summary: totals, granularity: "month", points: [], invoiceCount: 5, receiptCount: 4, expenseCount: 60,
      expenseCategories: Array.from({ length: 60 }, (_, index) => ({ category: `Category ${index}`, totalCents: 100 })),
    });
    const result = await call("folio_report_insights") as { expenseCategories: unknown[] };
    expect(result.expenseCategories).toHaveLength(50);
    expect(result).toMatchObject({ summary: totals, expenseCount: 60, expenseCategoryCount: 60, expenseCategoriesTruncated: true });
    expect(getReportInsights).toHaveBeenCalledWith("business-a", { from: "2026-01-01", to: "2026-03-03" }, "GBP");
  });

  it("uses scoped search and validates empty queries", async () => {
    vi.mocked(searchFolio).mockResolvedValue([]);
    await expect(call("folio_search", { query: "  Acme  " })).resolves.toEqual({ groups: [] });
    expect(searchFolio).toHaveBeenCalledWith("business-a", "Acme");
    await expect(call("folio_search", { query: " " })).rejects.toThrow();
  });

  it("filters and paginates reference values", async () => {
    await expect(call("folio_reference_data", { kind: "currencies", query: "gbp" })).resolves.toMatchObject({
      items: [{ code: "GBP", name: "Pound sterling" }], total: 1, nextOffset: null,
    });
    await expect(call("folio_reference_data", { kind: "payment_methods", limit: 2 })).resolves.toMatchObject({ total: 5, nextOffset: 2 });
    await expect(call("folio_reference_data", { kind: "timezones", query: "Europe/London" })).resolves.toMatchObject({ items: [{ code: "Europe/London", name: "Europe/London" }] });
  });

  it("normalises supported exchange-rate currencies and validates historical dates", async () => {
    await call("folio_get_exchange_rate", { base: " gbp ", quote: "usd", date: "2026-02-01" });
    expect(getExchangeRate).toHaveBeenCalledWith("GBP", "USD", "2026-02-01");
    await expect(call("folio_get_exchange_rate", { base: "GBP", quote: "XYZ" })).rejects.toThrow();
    await expect(call("folio_get_exchange_rate", { base: "GBP", quote: "USD", date: "2026-02-31" })).rejects.toThrow();
  });
});

describe("MCP business settings", () => {
  it("reads, replaces and removes a business logo without affecting another business", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    await expect(call("folio_set_business_logo", { dataUrl })).resolves.toMatchObject({ businessId: "business-a", hasLogo: true });
    await expect(call("folio_get_business_logo")).resolves.toEqual({ businessId: "business-a", dataUrl });
    await expect(call("folio_set_business_logo", { dataUrl: null })).resolves.toMatchObject({ businessId: "business-a", hasLogo: false });
    await expect(call("folio_get_business_logo")).resolves.toEqual({ businessId: "business-a", dataUrl: null });
    expect(await database.selectFrom("businesses").select("logo_url").where("id", "=", "business-b").executeTakeFirst()).toEqual({ logo_url: business.logo_url });
    await expect(call("folio_set_business_logo", { dataUrl: "https://example.test/image.png" })).rejects.toThrow();
  });

  it("reads fresh business data without exposing owner or logo fields", async () => {
    await database.updateTable("businesses").set({ name: "Updated elsewhere" }).where("id", "=", "business-a").execute();
    const result = await call("folio_get_business_settings");
    expect(result).toMatchObject({ id: "business-a", name: "Updated elsewhere", nextInvoiceNumber: 42 });
    expect(result).not.toHaveProperty("owner_user_id");
    expect(result).not.toHaveProperty("logo_url");
  });

  it("merges and validates partial settings, clears optional fields and cannot update another tenant", async () => {
    const result = await call("folio_update_business_settings", { name: "  New name  ", phone: "", invoicePrefix: "new" });
    expect(result).toMatchObject({ name: "New name", phone: null, invoicePrefix: "NEW", email: business.email, currency: "GBP" });
    const rows = await database.selectFrom("businesses").selectAll().orderBy("id").execute();
    expect(rows[0]).toMatchObject({ name: "New name", phone: null, owner_user_id: "owner-a", logo_url: business.logo_url, next_invoice_number: 42 });
    expect(rows[1]).toMatchObject({ id: "business-b", name: "Other business", phone: business.phone });
    expect(context.business.name).toBe("New name");
  });

  it("rejects invalid, empty or privileged settings changes without writing", async () => {
    await expect(call("folio_update_business_settings", {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(call("folio_update_business_settings", { currency: "XYZ" })).rejects.toThrow();
    await expect(call("folio_update_business_settings", { owner_user_id: "owner-b" })).rejects.toThrow();
    await expect(call("folio_update_business_settings", { logo_url: "https://example.test/logo" })).rejects.toThrow();
    await expect(call("folio_update_business_settings", { nextInvoiceNumber: 999 })).rejects.toThrow();
    expect(await database.selectFrom("businesses").selectAll().where("id", "=", "business-a").executeTakeFirst()).toEqual(business);
  });
});
