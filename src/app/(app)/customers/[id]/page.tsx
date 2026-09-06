import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Mail, Pencil, Plus, RotateCcw } from "@/components/ui/icons";

import { EntityHeader } from "@/components/folio/entity-header";
import { StatusBadge } from "@/components/folio/status-badge";
import { Button } from "@/components/ui/button";
import { CustomerAvatar } from "@/features/customers/customer-avatar";
import {
  archiveCustomer,
  restoreCustomer,
} from "@/features/customers/actions";
import { getCustomerWorkspace } from "@/features/customers/queries";
import {
  invoiceStatusLabel,
} from "@/features/invoices/calculations";
import { invoiceStatusTone } from "@/features/invoices/presentation";
import type { Customer } from "@/lib/db/types";
import { formatDate, formatMoney } from "@/lib/format";

type CustomerPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = { title: "Customer" };

function addressLines(customer: Customer) {
  return [
    customer.address_line_1,
    customer.address_line_2,
    [customer.city, customer.region, customer.postal_code].filter(Boolean).join(", "),
    customer.country_code,
  ].filter(Boolean) as string[];
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const { id } = await params;
  const workspace = await getCustomerWorkspace(id);

  if (!workspace) notFound();

  const { customer, invoices, summary } = workspace;
  const address = addressLines(customer);

  return (
    <div className="w-full space-y-6">
      <EntityHeader
        actions={
          <>
            {customer.email ? (
              <Button asChild className="text-[13px]" variant="outline">
                <a href={`mailto:${customer.email}`}>
                  <Mail aria-hidden="true" className="size-[14px]" />
                  Email
                </a>
              </Button>
            ) : null}
            <Button asChild className="text-[13px]" variant="outline">
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil aria-hidden="true" className="size-[14px]" />
                Edit
              </Link>
            </Button>
            <form action={customer.archived_at ? restoreCustomer : archiveCustomer}>
              <input name="id" type="hidden" value={customer.id} />
              <Button className="text-[13px]" type="submit" variant="ghost">
                {customer.archived_at ? (
                  <RotateCcw aria-hidden="true" className="size-[14px]" />
                ) : (
                  <Archive aria-hidden="true" className="size-[14px]" />
                )}
                {customer.archived_at ? "Restore" : "Archive"}
              </Button>
            </form>
          </>
        }
        backHref="/customers"
        backLabel="customers"
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: customer.name },
        ]}
        identity={
          <CustomerAvatar
            className="size-full rounded-full bg-transparent text-[14px]"
            imageUrl={customer.avatar_data_url}
            name={customer.name}
          />
        }
        meta={`Customer since ${formatDate(customer.created_at)}`}
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="truncate">{customer.name}</span>
            {customer.archived_at ? <StatusBadge status="archived" /> : null}
          </span>
        }
      />

      {customer.archived_at ? (
        <div className="rounded-[16px] border border-border bg-surface-subtle px-4 py-3 text-[13px] text-muted-foreground">
          This customer is archived. Existing invoices are unchanged. Restore
          the customer to use it on new invoices.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section id="invoices" className="min-w-0 scroll-mt-24">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] bg-border sm:grid-cols-4">
            {[
              ["Invoices", summary.invoiceCount.toLocaleString("en-GB")],
              ["Invoiced", formatMoney(summary.invoicedCents, summary.currency)],
              ["Received", formatMoney(summary.paidCents, summary.currency)],
              ["Due", formatMoney(summary.amountDueCents, summary.currency)],
            ].map(([label, value]) => (
              <div className="bg-card px-4 py-3.5" key={label}>
                <p className="text-[12px] text-subtle-foreground">{label}</p>
                <p className="mt-1 truncate text-[14px] font-medium text-foreground">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-[16px] bg-card">
            <div className="flex items-center justify-between gap-4 border-b px-4 py-3.5">
              <div>
                <h2 className="text-[14px] font-medium text-foreground">Invoice history</h2>
                <p className="mt-0.5 text-[12px] text-subtle-foreground">
                  Drafts, issued invoices, and payment progress.
                </p>
              </div>
              <Button asChild className="text-[13px]">
                <Link href={`/invoices/new?customerId=${customer.id}`}>
                  <Plus aria-hidden="true" className="size-[14px]" />
                  New invoice
                </Link>
              </Button>
            </div>

            {invoices.length ? (
              <div className="divide-y">
                {invoices.map((invoice) => (
                  <article className="flex items-start justify-between gap-5 px-4 py-4 transition-colors hover:bg-surface-subtle" key={invoice.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="truncate text-[14px] font-medium text-foreground underline-offset-4 hover:underline" href={`/invoices/${invoice.id}`}>
                          {invoice.invoice_number ?? "Draft invoice"}
                        </Link>
                        <StatusBadge
                          label={invoiceStatusLabel(invoice.status)}
                          status={invoice.status}
                          tone={invoiceStatusTone(invoice.status)}
                        />
                      </div>
                      <p className="mt-1 text-[12px] text-subtle-foreground">
                        {invoice.issue_date
                          ? `Issued ${formatDate(invoice.issue_date)}`
                          : `Created ${formatDate(invoice.created_at)}`}
                        {invoice.due_date ? ` · Due ${formatDate(invoice.due_date)}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[14px] font-medium text-foreground">
                        {formatMoney(invoice.total_cents, invoice.currency)}
                      </p>
                      <p className="mt-1 text-[12px] text-subtle-foreground">
                        {invoice.balanceDueCents > 0
                          ? `${formatMoney(invoice.balanceDueCents, invoice.currency)} due`
                          : "Settled"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <p className="text-[14px] font-medium text-foreground">No invoices yet</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Create the first invoice for this customer.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside id="details" className="scroll-mt-24 overflow-hidden rounded-[16px] bg-card lg:self-start">
          <section className="p-4">
            <h2 className="text-[14px] font-medium text-foreground">Customer details</h2>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-subtle-foreground">Invoice currency</dt>
                <dd className="text-right text-foreground">
                  {customer.default_currency ?? `${summary.currency} (business default)`}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-subtle-foreground">Status</dt>
                <dd className="text-right text-foreground">
                  {customer.archived_at ? "Archived" : "Active"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-subtle-foreground">Tax ID</dt>
                <dd className="text-right text-foreground">{customer.tax_id ?? "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-subtle-foreground">Last updated</dt>
                <dd className="text-right text-foreground">{formatDate(customer.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="border-t p-4">
            <h2 className="text-[14px] font-medium text-foreground">Billing address</h2>
            {address.length ? (
              <address className="mt-3 text-[13px] not-italic leading-5 text-muted-foreground">
                {address.map((line) => (
                  <span className="block" key={line}>{line}</span>
                ))}
              </address>
            ) : (
              <p className="mt-3 text-[13px] text-subtle-foreground">No billing address added.</p>
            )}
          </section>

          <section className="border-t p-4">
            <h2 className="text-[14px] font-medium text-foreground">Contact information</h2>
            <div className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <p>{customer.contact_name ?? "No contact name"}</p>
              {customer.email ? (
                <a className="block break-all underline-offset-4 hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a>
              ) : (
                <p className="text-subtle-foreground">No email address</p>
              )}
              {customer.phone ? (
                <a className="block underline-offset-4 hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a>
              ) : null}
            </div>
          </section>

          <section className="scroll-mt-24 border-t p-4" id="notes">
            <h2 className="text-[14px] font-medium text-foreground">Internal notes</h2>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-5 text-muted-foreground">
              {customer.notes ?? "No notes added."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
