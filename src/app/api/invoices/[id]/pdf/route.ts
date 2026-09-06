import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";

import { getInvoiceDocumentRecord } from "@/features/invoices/document-query";
import { getCurrentBusiness } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PdfRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: PdfRouteContext) {
  const business = await getCurrentBusiness();
  if (!business) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const record = await getInvoiceDocumentRecord(business, id);
  if (!record) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (record.lifecycle === "draft") {
    return Response.json(
      { error: "Issue this invoice before downloading its PDF" },
      { status: 409 },
    );
  }
  const { data } = record;

  const [{ renderToBuffer }, { InvoicePdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/features/invoices/pdf-document"),
  ]);
  const document = createElement(InvoicePdfDocument, { data }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(document);
  const filename = `${data.number.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/pdf",
    },
  });
}
