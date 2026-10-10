import { revalidatePath } from "next/cache";

import { handleMcpRequest } from "@/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return handleMcpRequest(request, () => revalidatePath("/", "layout"));
}

export { handle as POST, handle as GET, handle as DELETE };
