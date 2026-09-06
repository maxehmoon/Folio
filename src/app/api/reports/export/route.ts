import { getBusinessByOwnerId } from "@/lib/db/businesses";
import { loadFinancialEntries } from "@/features/finance/ledger";
import { renderFinancialEntriesCsv } from "@/features/reports/csv";
import { defaultReportRange, parseDateRange } from "@/features/reports/range";
import { todayInTimeZone } from "@/lib/format";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const business = await getBusinessByOwnerId(session.user.id);
  if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

  const url = new URL(request.url);
  const range = parseDateRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
    defaultReportRange(todayInTimeZone(business.timezone)),
  );

  const entries = await loadFinancialEntries({
    businessId: business.id,
    baseCurrency: business.currency,
    range,
  });
  const csv = renderFinancialEntriesCsv(entries, business.currency);

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="folio-report-${range.from}-to-${range.to}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
