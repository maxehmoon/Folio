import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArchiveIcon,
  PackageIcon,
  PencilIcon,
  RotateCcwIcon,
} from "@/components/ui/icons";

import { EntityHeader } from "@/components/folio/entity-header";
import { HorizontalSlidingTabBar } from "@/components/folio/sliding-tab-bar";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import {
  archiveItemAction,
  restoreItemAction,
} from "@/features/items/actions";
import { formatTaxRate } from "@/features/items/presentation";
import { getItem } from "@/features/items/queries";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Item details" };

type ItemPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemPage({ params }: ItemPageProps) {
  const { id } = await params;
  const item = await getItem(id);

  if (!item) notFound();

  const lifecycleAction = item.archived_at
    ? restoreItemAction.bind(null, item.id)
    : archiveItemAction.bind(null, item.id);

  return (
    <div className="w-full space-y-6">
      <EntityHeader
        actions={
          <>
            <Button asChild className="text-[13px]" variant="outline">
              <Link href={`/items/${item.id}/edit`}>
                <PencilIcon aria-hidden="true" className="size-[14px]" />
                Edit
              </Link>
            </Button>
            <form action={lifecycleAction}>
              <Button className="text-[13px]" type="submit" variant="ghost">
                {item.archived_at ? (
                  <RotateCcwIcon aria-hidden="true" className="size-[14px]" />
                ) : (
                  <ArchiveIcon aria-hidden="true" className="size-[14px]" />
                )}
                {item.archived_at ? "Restore" : "Archive"}
              </Button>
            </form>
          </>
        }
        backHref="/items"
        backLabel="items"
        breadcrumbs={[{ label: "Items", href: "/items" }, { label: item.name }]}
        identity={<PackageIcon aria-hidden="true" className="size-5 text-muted-foreground" />}
        meta={`Updated ${formatDate(item.updated_at)}`}
        status={<StatusBadge status={item.archived_at ? "archived" : "active"} />}
        title={item.name}
      />

      {item.archived_at ? (
        <div className="rounded-[16px] border border-border bg-surface-subtle px-4 py-3 text-[13px] text-muted-foreground">
          This item is archived. Existing invoices are unchanged. Restore the
          item to use it on new invoices.
        </div>
      ) : null}

      <HorizontalSlidingTabBar
        aria-label="Item sections"
        className="flex min-h-11 items-end gap-7 border-b"
      >
        <a
          className="relative z-10 -mb-px border-b-2 border-foreground px-0.5 pb-2.5 text-[13px] font-medium text-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#overview"
        >
          Overview
        </a>
        <a
          className="relative z-10 border-b-2 border-transparent px-0.5 pb-2.5 text-[13px] font-medium text-subtle-foreground motion-safe:transition-[color,transform] motion-safe:duration-150 hover:text-muted-foreground motion-safe:active:scale-[0.98]"
          data-sliding-tab
          href="#description"
        >
          Description
        </a>
      </HorizontalSlidingTabBar>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="overflow-hidden rounded-[16px] bg-card" id="overview">
          <div className="p-5">
            <p className="text-[13px] text-muted-foreground">Default rate</p>
            <p className="mt-3 text-[24px] font-medium leading-7 text-foreground">
              {formatMoney(item.unit_price_cents, item.currency)}
            </p>
            <p className="mt-1 text-[12px] text-subtle-foreground">per {item.unit}</p>
          </div>
          <dl className="grid grid-cols-3 gap-px border-t bg-border">
            <div className="bg-card p-4">
              <dt className="text-[12px] text-subtle-foreground">Unit</dt>
              <dd className="mt-1 text-[14px] font-medium text-foreground">{item.unit}</dd>
            </div>
            <div className="bg-card p-4">
              <dt className="text-[12px] text-subtle-foreground">Tax rate</dt>
              <dd className="mt-1 text-[14px] font-medium text-foreground">{formatTaxRate(item.tax_rate_bps)}</dd>
            </div>
            <div className="bg-card p-4">
              <dt className="text-[12px] text-subtle-foreground">Currency</dt>
              <dd className="mt-1 text-[14px] font-medium text-foreground">{item.currency}</dd>
            </div>
          </dl>
          <div className="scroll-mt-24 border-t p-5" id="description">
            <h2 className="text-[14px] font-medium text-foreground">Invoice description</h2>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-muted-foreground">
              {item.description ?? "No description added."}
            </p>
          </div>
        </section>

        <aside className="overflow-hidden rounded-[16px] bg-card lg:self-start">
          <div className="border-b p-4">
            <h2 className="text-[14px] font-medium text-foreground">History</h2>
          </div>
          <dl className="space-y-4 p-4 text-[13px]">
            <div>
              <dt className="text-subtle-foreground">Created</dt>
              <dd className="mt-1 text-foreground">{formatDate(item.created_at)}</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Last updated</dt>
              <dd className="mt-1 text-foreground">{formatDate(item.updated_at)}</dd>
            </div>
            <div>
              <dt className="text-subtle-foreground">Existing invoices</dt>
              <dd className="mt-1 leading-5 text-muted-foreground">Keep their original rate and description.</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
