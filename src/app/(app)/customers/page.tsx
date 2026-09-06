import type { Metadata } from "next";
import Link from "next/link";
import {
  CircleDollarSign,
  FileText,
  Plus,
  Search,
  UserPlus,
  Users,
} from "@/components/ui/icons";
import { redirect } from "next/navigation";

import { listCustomers } from "@/features/customers/queries";
import {
  parseCustomerListFilters,
  type CustomerListFilters,
} from "@/features/customers/schema";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/folio/data-table-shell";
import { EmptyState } from "@/components/folio/empty-state";
import { ListPagination } from "@/components/folio/list-pagination";
import { PageHeader } from "@/components/folio/page-header";
import { HorizontalSlidingTabBar } from "@/components/folio/sliding-tab-bar";
import { StatusBadge } from "@/components/folio/status-badge";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/lib/format";
import {
  buildListHref,
  DEFAULT_LIST_PAGE_LIMIT,
} from "@/lib/list-pagination";
import { CustomerAvatar } from "@/features/customers/customer-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Customers" };

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function listHref(
  filters: CustomerListFilters,
  changes: Partial<CustomerListFilters>,
) {
  const next = { ...filters, ...changes };
  return buildListHref("/customers", {
    q: next.q,
    status: next.status === "active" ? undefined : next.status,
    page: next.page > 1 ? next.page : undefined,
    limit: next.limit === DEFAULT_LIST_PAGE_LIMIT ? undefined : next.limit,
  });
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const rawSearchParams = await searchParams;
  const filters = parseCustomerListFilters(rawSearchParams);
  const result = await listCustomers(filters);
  const hasFilters = Boolean(filters.q) || filters.status !== "active";

  if (filters.page > result.totalPages) {
    redirect(listHref(filters, { page: result.totalPages }));
  }

  const metrics = [
    {
      label: "Customers",
      value: result.summary.activeCustomers.toLocaleString("en-GB"),
      detail: "Active billing profiles",
      icon: Users,
    },
    {
      label: "New customers",
      value: result.summary.newCustomers.toLocaleString("en-GB"),
      detail: "Added in the last 90 days",
      icon: UserPlus,
    },
    {
      label: "Total invoiced",
      value: formatMoney(result.summary.invoicedCents, result.summary.currency),
      detail: "Issued invoices",
      icon: FileText,
    },
    {
      label: "Amount due",
      value: formatMoney(result.summary.amountDueCents, result.summary.currency),
      detail: "Across issued invoices",
      icon: CircleDollarSign,
    },
  ];

  return (
    <div className="w-full space-y-7">
      <PageHeader
        title="Customers"
        description="Customer details, invoice totals and outstanding balances."
        actions={
          <Button asChild className="text-[13px]">
            <Link href="/customers/new">
              <Plus aria-hidden="true" className="size-[14px]" />
              New customer
            </Link>
          </Button>
        }
      />

      <section
        aria-label="Customer overview"
        className="overflow-hidden rounded-[16px] bg-border shadow-[0_1px_2px_rgb(41_41_41/0.02)]"
      >
        <h2 className="sr-only">Customer overview</h2>
        <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <div className="min-h-28 bg-card p-4" key={metric.label}>
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Icon aria-hidden="true" className="size-5 text-subtle-foreground" />
                  <span>{metric.label}</span>
                </div>
                <p className="mt-4 truncate text-[24px] font-medium leading-7 tracking-[-0.15px] text-foreground">
                  {metric.value}
                </p>
                <p className="mt-1 text-[12px] text-subtle-foreground">{metric.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <DataTableShell
        aria-label="Customers"
        className="rounded-[16px]"
        footer={
          <ListPagination
            ariaLabel="Customer pages"
            emptyLabel="No customers"
            page={filters.page}
            pageSize={filters.limit}
            pageSizeLabel="Customers per page"
            pathname="/customers"
            query={{
              q: filters.q,
              status: filters.status === "active" ? undefined : filters.status,
            }}
            rowCount={result.customers.length}
            total={result.total}
            totalPages={result.totalPages}
          />
        }
      >
        <HorizontalSlidingTabBar
          aria-label="Customer status"
          className="flex min-h-11 items-end gap-6 overflow-x-auto border-b px-4"
        >
          {([
            ["active", "Active"],
            ["archived", "Archived"],
            ["all", "All customers"],
          ] as const).map(([status, label]) => {
            const active = filters.status === status;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative z-10 -mb-px shrink-0 border-b-2 px-0.5 pb-2.5 text-[13px] font-medium motion-safe:transition-[color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.98] ${
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-subtle-foreground hover:text-muted-foreground"
                }`}
                data-sliding-tab
                href={listHref(filters, { page: 1, status })}
                key={status}
              >
                {label}
              </Link>
            );
          })}
        </HorizontalSlidingTabBar>

        <div className="border-b border-border bg-surface-subtle p-4">
          <form className="flex flex-col gap-2 sm:flex-row sm:items-center" method="get">
            <div className="relative w-full sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-[14px] -translate-y-1/2 text-subtle-foreground"
              />
              <Input
                aria-label="Search customers"
                className="pl-8 text-[13px]"
                defaultValue={filters.q}
                name="q"
                placeholder="Search name, email or phone…"
                type="search"
              />
            </div>
            <input name="status" type="hidden" value={filters.status} />
            <input name="limit" type="hidden" value={filters.limit} />
            <Button className="rounded-full text-[13px]" type="submit" variant="outline">
              Search
            </Button>
            {hasFilters ? (
              <Button asChild className="rounded-full text-[13px]" variant="ghost">
                <Link href="/customers">Reset</Link>
              </Button>
            ) : null}
          </form>
        </div>

        {result.customers.length ? (
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
                <TableHead className="h-10 px-4 text-[12px] font-medium text-subtle-foreground">
                  Customer
                </TableHead>
                <TableHead className="h-10 px-4 text-[12px] font-medium text-subtle-foreground">
                  Contact
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] font-medium text-subtle-foreground">
                  Invoices
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] font-medium text-subtle-foreground">
                  Total invoiced
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] font-medium text-subtle-foreground">
                  Amount due
                </TableHead>
                <TableHead className="h-10 px-4 text-[12px] font-medium text-subtle-foreground">
                  Status
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] font-medium text-subtle-foreground">
                  Updated
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.customers.map((customer) => (
                <TableRow className="hover:bg-surface-subtle" key={customer.id}>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CustomerAvatar
                        imageUrl={customer.avatar_data_url}
                        name={customer.name}
                      />
                      <div className="min-w-0">
                        <Link
                          className="block max-w-56 truncate font-medium text-foreground underline-offset-4 hover:underline"
                          href={`/customers/${customer.id}`}
                        >
                          {customer.name}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-subtle-foreground">
                          {customer.country_code ?? "No country added"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                    <span className="block">{customer.contact_name ?? "—"}</span>
                    {customer.email ? (
                      <span className="mt-0.5 block text-[12px] text-subtle-foreground">
                        {customer.email}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] text-muted-foreground">
                    {customer.invoiceCount.toLocaleString("en-GB")}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] font-medium text-foreground">
                    {formatMoney(customer.invoicedCents, result.summary.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] text-muted-foreground">
                    {formatMoney(customer.amountDueCents, result.summary.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge
                      status={customer.archived_at ? "archived" : "active"}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[12px] text-subtle-foreground">
                    {formatDate(customer.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title={hasFilters ? "No matching customers" : "Add your first customer"}
            description={
              hasFilters
                ? "Try changing your search or status filter."
                : "Customer details are reused when you create invoices."
            }
            action={
              !hasFilters ? (
                <Button asChild className="text-[13px]">
                  <Link href="/customers/new">New customer</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </DataTableShell>
    </div>
  );
}
