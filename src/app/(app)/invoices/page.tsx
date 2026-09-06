import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Plus, Search } from "@/components/ui/icons";

import { DataTableShell } from "@/components/folio/data-table-shell";
import { EmptyState } from "@/components/folio/empty-state";
import { PageHeader } from "@/components/folio/page-header";
import { HorizontalSlidingTabBar } from "@/components/folio/sliding-tab-bar";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoiceStatusLabel } from "@/features/invoices/calculations";
import { invoiceStatusTone } from "@/features/invoices/presentation";
import {
  INVOICE_PAGE_SIZE,
  getInvoiceOverview,
  listInvoicePage,
  type InvoiceListResult,
} from "@/features/invoices/queries";
import type { InvoiceListFilter } from "@/features/invoices/types";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Invoices" };

type InvoicesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FILTERS = new Set<InvoiceListFilter>([
  "all",
  "draft",
  "outstanding",
  "part-paid",
  "paid",
  "overdue",
  "void",
]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilter(value: string | undefined): InvoiceListFilter {
  return value && FILTERS.has(value as InvoiceListFilter)
    ? (value as InvoiceListFilter)
    : "all";
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

function listHref({
  page,
  search,
  status,
}: {
  page: number;
  search: string;
  status: InvoiceListFilter;
}) {
  const params = new URLSearchParams();

  if (search) params.set("q", search);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function resultLabel(result: InvoiceListResult, page: number) {
  if (result.total === 0) return "No invoices";

  const first = (page - 1) * INVOICE_PAGE_SIZE + 1;
  const last = Math.min(first + result.invoices.length - 1, result.total);
  return `${first}–${last} of ${result.total}`;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const [business, params] = await Promise.all([requireBusiness(), searchParams]);
  const search = first(params.q)?.trim() ?? "";
  const status = parseFilter(first(params.status));
  const page = parsePage(first(params.page));
  const today = todayInTimeZone(business.timezone);
  const [result, overview] = await Promise.all([
    listInvoicePage(business.id, { page, search, status, today }),
    getInvoiceOverview(business.id, business.currency, today),
  ]);
  const invoices = result.invoices;
  const filtered = Boolean(search) || status !== "all";

  if (page > result.totalPages) {
    redirect(listHref({ page: result.totalPages, search, status }));
  }

  return (
    <div className="w-full space-y-7">
      <PageHeader
        title="Invoices"
        description="Create, issue and track invoices from draft to payment."
        actions={
          <Button asChild className="text-[13px]">
            <Link href="/invoices/new">
              <Plus aria-hidden="true" className="size-[14px]" />
              New invoice
            </Link>
          </Button>
        }
      />

      <section className="grid overflow-hidden rounded-[16px] bg-border shadow-[0_1px_2px_rgb(41_41_41/0.02)] lg:grid-cols-[1.35fr_2fr] lg:gap-px">
        <div className="bg-inverse p-5 text-inverse-foreground">
          <p className="text-[13px] text-inverse-foreground/60">Amount to collect</p>
          <p className="mt-3 text-[24px] font-medium leading-7 tracking-[-0.15px]">
            {formatMoney(overview.amountDueCents, business.currency)}
          </p>
          <p className="mt-2 text-[12px] text-inverse-foreground/55">
            {overview.overdueCount} overdue · {overview.issuedCount} issued
            {overview.unconvertedAmountDueCount > 0
              ? ` · ${overview.unconvertedAmountDueCount} missing exchange rate`
              : ""}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border">
          {[
            ["All invoices", overview.totalCount],
            ["Drafts", overview.draftCount],
            ["Paid", overview.paidCount],
          ].map(([label, value]) => (
            <div className="bg-card p-4 lg:p-5" key={label}>
              <p className="text-[12px] text-subtle-foreground">{label}</p>
              <p className="mt-3 text-[24px] font-medium leading-7 text-foreground">
                {Number(value).toLocaleString("en-GB")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <DataTableShell
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{resultLabel(result, page)}</span>
            <nav aria-label="Invoice pages" className="flex items-center gap-1">
              <Button
                aria-label="Previous page"
                asChild={page > 1}
                className="rounded-full"
                disabled={page <= 1}
                size="icon-sm"
                variant="ghost"
              >
                {page > 1 ? (
                  <Link
                    aria-label="Previous page"
                    href={listHref({ page: page - 1, search, status })}
                  >
                    <ChevronLeft aria-hidden="true" className="size-[14px]" />
                  </Link>
                ) : (
                  <span>
                    <ChevronLeft aria-hidden="true" className="size-[14px]" />
                  </span>
                )}
              </Button>
              <span className="min-w-20 text-center">
                Page {page} of {result.totalPages}
              </span>
              <Button
                aria-label="Next page"
                asChild={page < result.totalPages}
                className="rounded-full"
                disabled={page >= result.totalPages}
                size="icon-sm"
                variant="ghost"
              >
                {page < result.totalPages ? (
                  <Link
                    aria-label="Next page"
                    href={listHref({ page: page + 1, search, status })}
                  >
                    <ChevronRight aria-hidden="true" className="size-[14px]" />
                  </Link>
                ) : (
                  <span>
                    <ChevronRight aria-hidden="true" className="size-[14px]" />
                  </span>
                )}
              </Button>
            </nav>
          </div>
        }
      >
        <HorizontalSlidingTabBar
          aria-label="Invoice status"
          className="flex min-h-11 items-end gap-6 overflow-x-auto border-b px-4"
        >
          {([
            ["all", "All"],
            ["outstanding", "Outstanding"],
            ["overdue", "Overdue"],
            ["part-paid", "Part-paid"],
            ["paid", "Paid"],
            ["draft", "Draft"],
            ["void", "Void"],
          ] as const).map(([filter, label]) => {
            const active = status === filter;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative z-10 -mb-px shrink-0 border-b-2 px-0.5 pb-2.5 text-[13px] font-medium motion-safe:transition-[color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.98] ${active ? "border-foreground text-foreground" : "border-transparent text-subtle-foreground hover:text-muted-foreground"}`}
                data-sliding-tab
                href={listHref({ page: 1, search, status: filter })}
                key={filter}
              >
                {label}
              </Link>
            );
          })}
        </HorizontalSlidingTabBar>

        <form className="flex flex-col gap-2 border-b bg-surface-subtle p-4 sm:flex-row" method="get">
          <div className="relative w-full sm:max-w-sm">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-subtle-foreground"
            />
            <Input
              aria-label="Search invoices"
              className="pl-8 text-[13px]"
              defaultValue={search}
              name="q"
              placeholder="Search invoice number or customer…"
              type="search"
            />
          </div>
          <input name="status" type="hidden" value={status} />
          <Button className="rounded-full text-[13px]" type="submit" variant="outline">
            Search
          </Button>
          {filtered ? (
            <Button asChild className="rounded-full text-[13px]" variant="ghost">
              <Link href="/invoices">Reset</Link>
            </Button>
          ) : null}
        </form>

        {invoices.length > 0 ? (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Invoice</TableHead>
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Customer</TableHead>
                <TableHead className="h-10 px-4 text-[12px] text-subtle-foreground">Status</TableHead>
                <TableHead className="hidden h-10 px-4 text-[12px] text-subtle-foreground md:table-cell">Issued</TableHead>
                <TableHead className="hidden h-10 px-4 text-[12px] text-subtle-foreground lg:table-cell">Due</TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] text-subtle-foreground">Amount due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="px-4 py-3">
                    <Link
                      className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
                      href={`/invoices/${invoice.id}`}
                    >
                      {invoice.invoice_number ?? "Draft invoice"}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-subtle-foreground">
                      {formatMoney(invoice.total_cents, invoice.currency)} total
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {invoice.customer_id ? (
                      <Link
                        className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        href={`/customers/${invoice.customer_id}`}
                      >
                        {invoice.customer_name}
                      </Link>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">
                        {invoice.customer_name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge
                      label={invoiceStatusLabel(invoice.status)}
                      status={invoice.status}
                      tone={invoiceStatusTone(invoice.status)}
                    />
                  </TableCell>
                  <TableCell className="hidden px-4 py-3 text-[12px] text-muted-foreground md:table-cell">
                    {invoice.issue_date ? formatDate(invoice.issue_date) : "—"}
                  </TableCell>
                  <TableCell className="hidden px-4 py-3 text-[12px] text-muted-foreground lg:table-cell">
                    {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] font-medium tabular-nums text-foreground">
                    {formatMoney(invoice.balanceDueCents, invoice.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            action={
              filtered ? (
                <Button asChild variant="secondary">
                  <Link href="/invoices">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/invoices/new">Create invoice</Link>
                </Button>
              )
            }
            description={
              filtered
                ? "Try changing the search term or status."
                : "Create a draft, add line items and issue it when it is ready."
            }
            icon={<FileText aria-hidden="true" />}
            title={filtered ? "No matching invoices" : "Create your first invoice"}
          />
        )}
      </DataTableShell>
    </div>
  );
}
