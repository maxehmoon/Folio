import { revalidatePath } from "next/cache";

import { handleApiRequest } from "@/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return handleApiRequest(request, () => revalidatePath("/", "layout"));
}

export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
