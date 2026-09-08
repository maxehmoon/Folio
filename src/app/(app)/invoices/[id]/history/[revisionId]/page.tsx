import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/folio/page-header";
import { Button } from "@/components/ui/button";
import { buildInvoiceDocumentData } from "@/features/invoices/document-mapper";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { getInvoiceRevision } from "@/features/invoices/revision-query";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Invoice history" };

export default async function InvoiceRevisionPage({ params }: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const [business, { id, revisionId }] = await Promise.all([requireBusiness(), params]);
  const revision = await getInvoiceRevision(business.id, id, revisionId);
  if (!revision) notFound();
  const savedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: business.timezone,
  }).format(new Date(revision.created_at));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: revision.invoice_number ?? "Invoice", href: `/invoices/${id}` },
          { label: "Previous version" },
        ]}
        title="Previous invoice version"
        description={`Saved before ${revision.actor_name} edited this invoice on ${savedAt}.`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-[13px]">
        <p className="text-muted-foreground">This is a historical copy. Open the current invoice to make changes.</p>
        <Button asChild variant="outline">
          <a href={`/api/invoices/${id}/pdf?revision=${revision.id}`}>Download previous PDF</a>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-muted p-4 sm:p-6">
        <div className="mx-auto w-[700px]">
          <InvoiceDocument data={buildInvoiceDocumentData(revision.detail)} />
        </div>
      </div>
    </div>
  );
}
