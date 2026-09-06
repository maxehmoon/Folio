import { searchFolio } from "@/features/search/queries";
import type { FolioSearchResponse } from "@/features/search/types";
import { getCurrentBusiness, getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const business = await getCurrentBusiness();
  if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return Response.json({ groups: [] } satisfies FolioSearchResponse);
  }
  if (query.length > 100) {
    return Response.json({ error: "Search is too long" }, { status: 400 });
  }

  return Response.json(
    { groups: await searchFolio(business.id, query) } satisfies FolioSearchResponse,
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
