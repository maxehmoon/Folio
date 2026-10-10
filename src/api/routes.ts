import { z } from "zod";

import type { ApiOperation } from "./operations";

export type ApiRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  operation: string;
  bodyKey?: "changes";
  format?: "pdf" | "csv";
  status?: 201;
};

// Keep static paths ahead of parameterised paths within each resource.
export const apiRoutes: ApiRoute[] = [
  { method: "GET", path: "/customers", operation: "list_customers" },
  { method: "POST", path: "/customers", operation: "create_customer", status: 201 },
  { method: "GET", path: "/customers/{id}", operation: "get_customer" },
  { method: "PATCH", path: "/customers/{id}", operation: "update_customer", bodyKey: "changes" },
  { method: "POST", path: "/customers/{id}/archive", operation: "archive_customer" },
  { method: "POST", path: "/customers/{id}/restore", operation: "restore_customer" },
  { method: "GET", path: "/customers/{id}/avatar", operation: "get_customer_avatar" },
  { method: "PUT", path: "/customers/{id}/avatar", operation: "set_customer_avatar" },
  { method: "GET", path: "/items", operation: "list_items" },
  { method: "POST", path: "/items", operation: "create_item", status: 201 },
  { method: "GET", path: "/items/{id}", operation: "get_item" },
  { method: "PATCH", path: "/items/{id}", operation: "update_item", bodyKey: "changes" },
  { method: "POST", path: "/items/{id}/archive", operation: "archive_item" },
  { method: "POST", path: "/items/{id}/restore", operation: "restore_item" },
  { method: "GET", path: "/expenses", operation: "list_expenses" },
  { method: "POST", path: "/expenses", operation: "create_expense", status: 201 },
  { method: "GET", path: "/expenses/{id}", operation: "get_expense" },
  { method: "PATCH", path: "/expenses/{id}", operation: "update_expense", bodyKey: "changes" },
  { method: "DELETE", path: "/expenses/{id}", operation: "delete_expense" },
  { method: "GET", path: "/expenses/{id}/receipt", operation: "get_expense_receipt" },
  { method: "PUT", path: "/expenses/{id}/receipt", operation: "set_expense_receipt" },
  { method: "POST", path: "/invoices/preview", operation: "preview_invoice" },
  { method: "GET", path: "/invoices", operation: "list_invoices" },
  { method: "POST", path: "/invoices", operation: "create_invoice", status: 201 },
  { method: "GET", path: "/invoices/{invoiceId}", operation: "get_invoice" },
  { method: "PUT", path: "/invoices/{invoiceId}", operation: "update_invoice" },
  { method: "DELETE", path: "/invoices/{invoiceId}", operation: "delete_draft_invoice" },
  { method: "POST", path: "/invoices/{invoiceId}/issue", operation: "issue_invoice" },
  { method: "POST", path: "/invoices/{invoiceId}/refresh-seller", operation: "refresh_invoice_seller" },
  { method: "GET", path: "/invoices/{invoiceId}/revisions", operation: "list_invoice_revisions" },
  { method: "GET", path: "/invoices/{invoiceId}/revisions/{revisionId}", operation: "get_invoice_revision" },
  { method: "GET", path: "/invoices/{invoiceId}/pdf", operation: "get_invoice_pdf", format: "pdf" },
  { method: "GET", path: "/invoices/{invoiceId}/revisions/{revisionId}/pdf", operation: "get_invoice_pdf", format: "pdf" },
  { method: "GET", path: "/payments", operation: "list_payments" },
  { method: "POST", path: "/payments", operation: "record_payment", status: 201 },
  { method: "GET", path: "/payments/{paymentId}", operation: "get_payment" },
  { method: "DELETE", path: "/payments/{paymentId}", operation: "delete_payment" },
  { method: "GET", path: "/payable-invoices", operation: "list_payable_invoices" },
  { method: "POST", path: "/recurring-invoices/preview-dates", operation: "preview_recurring_dates" },
  { method: "POST", path: "/recurring-invoices/run-due", operation: "run_due_recurring_invoices" },
  { method: "GET", path: "/recurring-invoices", operation: "list_recurring_invoices" },
  { method: "POST", path: "/recurring-invoices", operation: "create_recurring_invoice", status: 201 },
  { method: "GET", path: "/recurring-invoices/{id}", operation: "get_recurring_invoice" },
  { method: "PUT", path: "/recurring-invoices/{id}", operation: "update_recurring_invoice" },
  { method: "POST", path: "/recurring-invoices/{id}/pause", operation: "pause_recurring_invoice" },
  { method: "POST", path: "/recurring-invoices/{id}/resume", operation: "resume_recurring_invoice" },
  { method: "POST", path: "/recurring-invoices/{id}/end", operation: "end_recurring_invoice" },
  { method: "GET", path: "/recurring-invoices/{id}/history", operation: "recurring_invoice_history" },
  { method: "GET", path: "/dashboard/summary", operation: "dashboard_summary" },
  { method: "GET", path: "/dashboard/activity", operation: "recent_activity" },
  { method: "GET", path: "/reports/summary", operation: "financial_summary" },
  { method: "GET", path: "/reports/insights", operation: "report_insights" },
  { method: "GET", path: "/reports/entries", operation: "financial_entries" },
  { method: "GET", path: "/reports/entries.csv", operation: "export_report_csv", format: "csv" },
  { method: "GET", path: "/search", operation: "search" },
  { method: "GET", path: "/reference/{kind}", operation: "reference_data" },
  { method: "GET", path: "/exchange-rates", operation: "get_exchange_rate" },
  { method: "GET", path: "/business", operation: "get_business_settings" },
  { method: "PATCH", path: "/business", operation: "update_business_settings" },
  { method: "GET", path: "/business/logo", operation: "get_business_logo" },
  { method: "PUT", path: "/business/logo", operation: "set_business_logo" },
];

export function pathParameterNames(route: ApiRoute): string[] {
  return Array.from(route.path.matchAll(/\{([^}]+)\}/g), ([, name]) => name);
}

/** The HTTP payload excludes IDs supplied by the URL and unwraps flat patches. */
export function getRequestSchema(route: ApiRoute, operation: ApiOperation): z.core.$ZodType {
  if (route.bodyKey) return operation.schema.shape[route.bodyKey];
  const parameters = new Set(pathParameterNames(route));
  return z.object(Object.fromEntries(
    Object.entries(operation.schema.shape).filter(([name]) => !parameters.has(name)),
  )).strict();
}
