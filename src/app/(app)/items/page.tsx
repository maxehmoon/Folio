import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  PackageIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/ui/icons"

import { DataTableShell } from "@/components/folio/data-table-shell"
import { EmptyState } from "@/components/folio/empty-state"
import { ListPagination } from "@/components/folio/list-pagination"
import { PageHeader } from "@/components/folio/page-header"
import { HorizontalSlidingTabBar } from "@/components/folio/sliding-tab-bar"
import { StatusBadge } from "@/components/folio/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney } from "@/lib/format"
import { INVOICE_CURRENCIES } from "@/lib/currencies"
import {
  buildListHref,
  DEFAULT_LIST_PAGE_LIMIT,
} from "@/lib/list-pagination"
import { formatTaxRate } from "@/features/items/presentation"
import { listItems } from "@/features/items/queries"
import {
  parseItemListSearch,
  type ItemListSearch,
} from "@/features/items/schema"

export const metadata: Metadata = { title: "Items" }

type ItemsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function listHref(
  filters: ItemListSearch,
  changes: Partial<ItemListSearch>,
): string {
  const next = { ...filters, ...changes }
  return buildListHref("/items", {
    q: next.q,
    status: next.status === "active" ? undefined : next.status,
    currency: next.currency,
    page: next.page > 1 ? next.page : undefined,
    limit: next.limit === DEFAULT_LIST_PAGE_LIMIT ? undefined : next.limit,
  })
}

export default async function ItemsPage({ searchParams }: ItemsPageProps) {
  const filters = parseItemListSearch(await searchParams)
  const result = await listItems(filters)

  if (filters.page > result.pagination.totalPages) {
    redirect(listHref(filters, { page: result.pagination.totalPages }))
  }

  const hasFilters =
    Boolean(filters.q) || filters.status !== "active" || Boolean(filters.currency)

  return (
    <div className="w-full space-y-7">
      <PageHeader
        title="Items & services"
        description="Save invoice lines with a default price, unit and tax rate."
        actions={
          <Button asChild className="text-[13px]">
            <Link href="/items/new">
              <PlusIcon aria-hidden="true" className="size-[14px]" />
              New item
            </Link>
          </Button>
        }
      />

      <section className="flex flex-col gap-5 rounded-[16px] bg-card p-5 shadow-[0_1px_2px_rgb(41_41_41/0.02)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-muted text-muted-foreground">
            <PackageIcon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-[14px] font-medium text-foreground">Saved invoice lines</h2>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-muted-foreground">
              Items store reusable invoice lines. Updating an item does not
              change historical invoices.
            </p>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-5 border-t pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div>
            <dt className="text-[12px] text-subtle-foreground">Active</dt>
            <dd className="mt-1 text-[14px] font-medium text-foreground">{result.summary.activeItems}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-subtle-foreground">Archived</dt>
            <dd className="mt-1 text-[14px] font-medium text-foreground">{result.summary.archivedItems}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-subtle-foreground">Currencies</dt>
            <dd className="mt-1 text-[14px] font-medium text-foreground">{result.summary.currencies}</dd>
          </div>
        </dl>
      </section>

      <DataTableShell
        aria-label="Items"
        footer={
          <ListPagination
            ariaLabel="Item pages"
            emptyLabel="No items"
            page={filters.page}
            pageSize={filters.limit}
            pageSizeLabel="Items per page"
            pathname="/items"
            query={{
              q: filters.q,
              status: filters.status === "active" ? undefined : filters.status,
              currency: filters.currency,
            }}
            rowCount={result.items.length}
            total={result.pagination.total}
            totalPages={result.pagination.totalPages}
          />
        }
      >
        <HorizontalSlidingTabBar
          aria-label="Item status"
          className="flex min-h-11 items-end gap-6 overflow-x-auto border-b px-4"
        >
          {([[
            "active",
            "Active",
          ], ["archived", "Archived"], ["all", "All items"]] as const).map(([status, label]) => {
            const active = filters.status === status

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative z-10 -mb-px shrink-0 border-b-2 px-0.5 pb-2.5 text-[13px] font-medium motion-safe:transition-[color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.98] ${active ? "border-foreground text-foreground" : "border-transparent text-subtle-foreground hover:text-muted-foreground"}`}
                data-sliding-tab
                href={listHref(filters, { page: 1, status })}
                key={status}
              >
                {label}
              </Link>
            )
          })}
        </HorizontalSlidingTabBar>

        <div className="border-b border-border bg-surface-subtle p-4">
          <form className="flex flex-col gap-3 lg:flex-row" method="get">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-[14px] -translate-y-1/2 text-subtle-foreground"
              />
              <Input
                aria-label="Search items"
                className="pl-8 text-[13px]"
                defaultValue={filters.q}
                maxLength={100}
                name="q"
                placeholder="Search name or description…"
                type="search"
              />
            </div>

            <SearchableSelect
              className="w-full text-[13px] lg:w-52"
              defaultValue={filters.currency ?? "all"}
              name="currency"
              options={[
                { label: "All currencies", value: "all" },
                ...INVOICE_CURRENCIES.map((currency) => ({
                  description: currency.name,
                  keywords: currency.name,
                  label: currency.code,
                  value: currency.code,
                })),
              ]}
              searchPlaceholder="Search currencies…"
            />

            <input name="status" type="hidden" value={filters.status} />
            <input name="limit" type="hidden" value={filters.limit} />
            <Button
              className="rounded-full text-[13px]"
              type="submit"
              variant="outline"
            >
              Apply
            </Button>
            {hasFilters ? (
              <Button
                asChild
                className="rounded-full text-[13px]"
                variant="ghost"
              >
                <Link href="/items">Reset</Link>
              </Button>
            ) : null}
          </form>
        </div>

        {result.items.length > 0 ? (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
                <TableHead className="h-10 px-4 text-[12px] font-medium text-subtle-foreground">
                  Item
                </TableHead>
                <TableHead className="h-10 px-4 text-[12px] font-medium text-subtle-foreground">
                  Unit
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] font-medium text-subtle-foreground">
                  Unit price
                </TableHead>
                <TableHead className="h-10 px-4 text-right text-[12px] font-medium text-subtle-foreground">
                  Tax
                </TableHead>
                <TableHead className="h-10 px-4 text-[12px] font-medium text-subtle-foreground">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-80 px-4 py-3">
                    <Link
                      className="block truncate text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
                      href={`/items/${item.id}`}
                    >
                      {item.name}
                    </Link>
                    {item.description ? (
                      <p className="mt-0.5 truncate text-[12px] text-subtle-foreground">
                        {item.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[13px] text-muted-foreground">
                    {item.unit}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] font-medium text-foreground">
                    {formatMoney(item.unit_price_cents, item.currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-[13px] text-muted-foreground">
                    {formatTaxRate(item.tax_rate_bps)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <StatusBadge
                      status={item.archived_at ? "archived" : "active"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<PackageIcon aria-hidden="true" />}
            title={hasFilters ? "No matching items" : "Add your first item"}
            description={
              hasFilters
                ? "Try changing your search, status, or currency filter."
                : "Saved items can be added to new invoices."
            }
            action={
              hasFilters ? undefined : (
                <Button asChild className="text-[13px]">
                  <Link href="/items/new">New item</Link>
                </Button>
              )
            }
          />
        )}
      </DataTableShell>
    </div>
  )
}
