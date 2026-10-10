import "server-only";

import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";

import { InvoiceAggregateConflictError } from "@/features/invoices/aggregate";
import { buildInvoiceDocumentData } from "@/features/invoices/document-mapper";
import { FormSubmissionError, type SubmittedInvoice } from "@/features/invoices/forms";
import { getInvoiceDetail, listInvoicePage, INVOICE_PAGE_SIZE } from "@/features/invoices/queries";
import { getInvoiceRevision } from "@/features/invoices/revision-query";
import {
  createInvoice,
  deleteDraftInvoice,
  issueInvoice,
  previewInvoice,
  updateDraftSeller,
  updateInvoice,
} from "@/features/invoices/service";
import type { InvoiceDetail } from "@/features/invoices/types";
import { PaymentAllocationError } from "@/features/payments/invoice-allocation";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { db } from "@/lib/db";
import { todayInTimeZone } from "@/lib/format";
import { isIsoDate } from "@/lib/iso-date";

import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

const id = z.string().trim().min(1).max(100);
const date = z.string().refine(isIsoDate, "Use a valid YYYY-MM-DD date");
const expectedUpdatedAt = z.string().datetime().describe("Exact updated_at value from the latest invoice read; prevents overwriting intervening changes.");
const integer = z.number().int().min(0).max(2_147_483_647);
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().default(null);
const invoiceInput = {
  customerId: id.describe("Customer ID belonging to this business."),
  currency: z.string().regex(/^[A-Z]{3}$/).refine((value) => INVOICE_CURRENCY_CODES.has(value), "Unsupported invoice currency"),
  issueDate: date.nullable().default(null),
  dueDate: date.nullable().default(null),
  exchangeRateMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().default(null)
    .describe("Reporting currency per invoice currency, in millionths: 1000000 = 1. Omit/null to fetch a reference rate. The business currency requires 1000000."),
  notes: nullableText(5_000),
  paymentInstructions: nullableText(2_000),
  lines: z.array(z.object({
    itemId: id.nullable().default(null).describe("Optional saved item ID. Supply all line values explicitly; this ID does not populate price or description."),
    description: z.string().trim().min(1).max(500),
    details: nullableText(5_000),
    unit: z.string().trim().min(1).max(40),
    quantityThousandths: integer.min(1).describe("Quantity in thousandths: 1500 = 1.5 units."),
    unitPriceCents: integer.describe("Unit price in integer cents (minor units): 1250 = 12.50."),
    taxRateBps: integer.max(10_000).describe("Tax rate in basis points: 2000 = 20%."),
  }).strict()).min(1).max(100),
};

function validateDates(input: SubmittedInvoice) {
  if (input.issueDate && input.dueDate && input.dueDate < input.issueDate) {
    throw new McpToolError("INVALID_INPUT", "Due date cannot be before the issue date");
  }
  return input;
}

async function domainResult<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FormSubmissionError || error instanceof PaymentAllocationError) {
      throw new McpToolError("INVALID_STATE", error.message);
    }
    if (error instanceof InvoiceAggregateConflictError) {
      throw new McpToolError("CONFLICT", error.message);
    }
    throw error;
  }
}

async function requireInvoice(context: McpContext, invoiceId: string) {
  const detail = await getInvoiceDetail(context.business.id, invoiceId, todayInTimeZone(context.business.timezone));
  if (!detail) throw new McpToolError("NOT_FOUND", "Invoice not found");
  return detail;
}

function boundedDetail(detail: InvoiceDetail) {
  return {
    ...detail,
    payments: detail.payments.slice(0, 50),
    revisions: detail.revisions?.slice(0, 50),
    paymentCount: detail.payments.length,
    revisionCount: detail.revisions?.length ?? 0,
    paymentsTruncated: detail.payments.length > 50,
    revisionsTruncated: (detail.revisions?.length ?? 0) > 50,
  };
}

async function documentData(context: McpContext, invoiceId: string, revisionId?: string) {
  if (revisionId) {
    const revision = await getInvoiceRevision(context.business.id, invoiceId, revisionId);
    if (!revision) throw new McpToolError("NOT_FOUND", "Invoice revision not found");
    return buildInvoiceDocumentData(revision.detail);
  }
  return buildInvoiceDocumentData(await requireInvoice(context, invoiceId));
}

function pdfFilename(number: string, revisionId?: string) {
  return `${number.replace(/[^a-zA-Z0-9_-]/g, "-")}${revisionId ? "-previous-version" : ""}.pdf`;
}

export async function readInvoicePdf(context: McpContext, invoiceId: string, revisionId?: string) {
  const data = await documentData(context, invoiceId, revisionId);
  const [{ renderToBuffer }, { InvoicePdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/features/invoices/pdf-document"),
  ]);
  const document = createElement(InvoicePdfDocument, { data }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(document);
  if (buffer.length > 2 * 1024 * 1024) {
    throw new McpToolError("RESULT_TOO_LARGE", "This PDF exceeds the 2 MiB MCP download limit. Download it from the Folio invoice page.");
  }
  return { filename: pdfFilename(data.number, revisionId), mimeType: "application/pdf", encoding: "base64", data: buffer.toString("base64") };
}

export function registerInvoiceTools(register: ToolRegistrar, context: McpContext) {
  register("folio_list_invoices", {
    description: "List invoices in pages of 25, with search and status filters. Includes integer cents totals, payment balances and updated_at for safe editing. Overdue status uses the business timezone.",
    readOnly: true,
    inputSchema: {
      page: z.number().int().min(1).max(10_000).default(1),
      search: z.string().trim().max(200).optional(),
      status: z.enum(["all", "draft", "outstanding", "part-paid", "paid", "overdue", "void"]).default("all"),
    },
  }, async (input) => ({
    ...await listInvoicePage(context.business.id, { ...input, today: todayInTimeZone(context.business.timezone) }),
    page: input.page,
    pageSize: INVOICE_PAGE_SIZE,
  }));

  register("folio_get_invoice", {
    description: "Read an invoice, all its lines, calculated status/balance in cents, seller/customer snapshots and updated_at. Includes up to 50 payments and revisions; use payment/history tools for pagination when truncated.",
    readOnly: true,
    inputSchema: { invoiceId: id },
  }, async ({ invoiceId }) => boundedDetail(await requireInvoice(context, invoiceId)));

  register("folio_preview_invoice", {
    description: "Validate and calculate a proposed invoice without saving it. Uses the same ownership checks, per-line rounding, integer cents/thousandths/basis points and exchange-rate snapshots as creation. Null paymentInstructions uses the business default. May fetch a reference exchange rate when exchangeRateMicros is null.",
    readOnly: true,
    openWorld: true,
    inputSchema: invoiceInput,
  }, async (input) => domainResult(() => previewInvoice(context.business, validateDates(input))));

  register("folio_create_invoice", {
    description: "Create a draft invoice with 1–100 lines. Amounts are integer cents, quantities thousandths and tax rates basis points. Null paymentInstructions uses the business default. Does not issue the invoice or allocate its number; use folio_issue_invoice after reviewing the draft. May fetch a reference exchange rate.",
    openWorld: true,
    inputSchema: invoiceInput,
  }, async (input) => {
    const invoiceId = await domainResult(() => createInvoice(context.business, validateDates(input)));
    return boundedDetail(await requireInvoice(context, invoiceId));
  });

  register("folio_update_invoice", {
    description: "Replace the editable fields and all lines of a draft or published invoice. Read it first and supply its exact updated_at. Omitted nullable fields are cleared. Published edits require publishedEditConfirmed=true, preserve document snapshots by default, save a revision and recalculate receipt allocations. Changing currency or totals may fail if payments cannot fit. No invoice number or lifecycle changes.",
    destructive: true,
    openWorld: true,
    inputSchema: {
      invoiceId: id,
      expectedUpdatedAt,
      publishedEditConfirmed: z.boolean().default(false),
      refreshCustomerDetails: z.boolean().default(false).describe("Refresh the saved customer snapshot from current customer details on a published invoice."),
      ...invoiceInput,
    },
  }, async ({ invoiceId, expectedUpdatedAt, publishedEditConfirmed, refreshCustomerDetails, ...input }) => {
    const actor = await db.selectFrom("auth_user").select("name").where("id", "=", context.userId).executeTakeFirst();
    await domainResult(() => updateInvoice(context.business, invoiceId, validateDates(input), {
      expectedUpdatedAt,
      confirmed: publishedEditConfirmed,
      refreshCustomerDetails,
      actorName: actor?.name ?? "MCP",
    }));
    return boundedDetail(await requireInvoice(context, invoiceId));
  });

  register("folio_issue_invoice", {
    description: "Issue a reviewed draft and permanently allocate the next invoice number. Requires the current updated_at and confirm=true. Missing dates use today in the business timezone and default payment terms. May refresh a reference exchange rate. Does not send the invoice to the customer.",
    destructive: true,
    openWorld: true,
    inputSchema: { invoiceId: id, expectedUpdatedAt, confirm: z.literal(true) },
  }, async ({ invoiceId, expectedUpdatedAt }) => {
    await domainResult(() => issueInvoice(context.business, invoiceId, expectedUpdatedAt));
    return boundedDetail(await requireInvoice(context, invoiceId));
  });

  register("folio_delete_draft_invoice", {
    description: "Permanently delete a draft invoice and its lines. Requires its current updated_at and confirm=true. Published invoices cannot be deleted.",
    destructive: true,
    inputSchema: { invoiceId: id, expectedUpdatedAt, confirm: z.literal(true) },
  }, async ({ invoiceId, expectedUpdatedAt }) => {
    const deleted = await deleteDraftInvoice(context.business, invoiceId, expectedUpdatedAt);
    if (!deleted) throw new McpToolError("CONFLICT", "The draft changed, is unavailable or has already been issued. Read it again before deleting.");
    return { invoiceId, deleted: true };
  });

  register("folio_refresh_invoice_seller", {
    description: "Refresh a draft invoice's saved seller details and footer from the current business profile. Requires its current updated_at. Published seller snapshots cannot be refreshed.",
    destructive: true,
    inputSchema: { invoiceId: id, expectedUpdatedAt },
  }, async ({ invoiceId, expectedUpdatedAt }) => {
    await domainResult(() => updateDraftSeller(context.business, invoiceId, expectedUpdatedAt));
    return boundedDetail(await requireInvoice(context, invoiceId));
  });

  register("folio_list_invoice_revisions", {
    description: "List saved previous versions of a published invoice, newest first. Returns at most 50 revision summaries; use folio_get_invoice_revision for the saved document and payments.",
    readOnly: true,
    inputSchema: { invoiceId: id, page: z.number().int().min(1).max(10_000).default(1), pageSize: z.number().int().min(1).max(50).default(25) },
  }, async ({ invoiceId, page, pageSize }) => {
    const invoice = await db.selectFrom("invoices").select("id").where("business_id", "=", context.business.id).where("id", "=", invoiceId).executeTakeFirst();
    if (!invoice) throw new McpToolError("NOT_FOUND", "Invoice not found");
    const query = db.selectFrom("invoice_revisions").where("business_id", "=", context.business.id).where("invoice_id", "=", invoiceId);
    const [revisions, count] = await Promise.all([
      query.select(["id", "actor_name", "invoice_number", "currency", "total_cents", "created_at"])
        .orderBy("created_at", "desc").orderBy("id", "desc").limit(pageSize).offset((page - 1) * pageSize).execute(),
      query.select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
    ]);
    const total = Number(count.total);
    return { revisions, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  });

  register("folio_get_invoice_revision", {
    description: "Read an immutable saved previous invoice version, including its original snapshots, lines and up to 50 recorded payments. Amounts are integer cents. This does not restore or modify the invoice.",
    readOnly: true,
    inputSchema: { invoiceId: id, revisionId: id },
  }, async ({ invoiceId, revisionId }) => {
    const revision = await getInvoiceRevision(context.business.id, invoiceId, revisionId);
    if (!revision) throw new McpToolError("NOT_FOUND", "Invoice revision not found");
    return {
      id: revision.id,
      invoiceId: revision.invoice_id,
      actorName: revision.actor_name,
      invoiceNumber: revision.invoice_number,
      currency: revision.currency,
      totalCents: revision.total_cents,
      createdAt: revision.created_at,
      detail: boundedDetail(revision.detail),
    };
  });

  register("folio_get_invoice_pdf", {
    description: "Get the MCP resource URI for the current invoice PDF or a saved revision. Read the returned resource to download the application/pdf document (maximum 2 MiB).",
    readOnly: true,
    inputSchema: { invoiceId: id, revisionId: id.optional() },
  }, async ({ invoiceId, revisionId }) => {
    const data = await documentData(context, invoiceId, revisionId);
    const encodedId = encodeURIComponent(invoiceId);
    return {
      uri: revisionId ? `folio://invoices/${encodedId}/revisions/${encodeURIComponent(revisionId)}/pdf` : `folio://invoices/${encodedId}/pdf`,
      filename: pdfFilename(data.number, revisionId),
      mimeType: "application/pdf",
    };
  });
}
