import { getExchangeRate } from "@/lib/exchange-rates";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const base = params.get("base") ?? "";
  const quote = params.get("quote") ?? "";
  const date = params.get("date");

  if (
    !INVOICE_CURRENCY_CODES.has(base.toUpperCase()) ||
    !INVOICE_CURRENCY_CODES.has(quote.toUpperCase())
  ) {
    return Response.json({ error: "Choose valid currencies" }, { status: 400 });
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Choose a valid rate date" }, { status: 400 });
  }

  try {
    return Response.json(await getExchangeRate(base, quote, date));
  } catch {
    return Response.json(
      { error: "The reference exchange rate is temporarily unavailable" },
      { status: 503 },
    );
  }
}
