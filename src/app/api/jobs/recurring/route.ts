import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runRecurringTicksOnceAt } from "@/features/recurring/execution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function suppliedSecret(request: Request): string {
  const authorisation = request.headers.get("authorization") ?? "";
  if (authorisation.toLowerCase().startsWith("bearer ")) {
    return authorisation.slice("bearer ".length).trim();
  }
  return request.headers.get("x-cron-secret")?.trim() ?? "";
}

function isAuthorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  return timingSafeEqual(digest(suppliedSecret(request)), digest(expected));
}

async function handleRecurringJob(request: Request): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const execution = await runRecurringTicksOnceAt();
  if (execution.status === "coalesced") {
    return NextResponse.json(
      { status: "coalesced" },
      { status: 202, headers: { "Retry-After": "60" } },
    );
  }
  return NextResponse.json(execution.result);
}

export const GET = handleRecurringJob;
export const POST = handleRecurringJob;
