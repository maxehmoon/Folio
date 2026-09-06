import { cache } from "react";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";
import { getBusinessByOwnerId } from "@/lib/db/businesses";
import type { Business } from "@/lib/db/types";

export const getSession = cache(async () => {
  const requestHeaders = new Headers(await headers());
  // Server actions can replace the session cookie. The cookie store reflects
  // those writes during the following render; the original headers do not.
  requestHeaders.set("cookie", (await cookies()).toString());
  return getAuth(requestHeaders).api.getSession({ headers: requestHeaders });
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export const getCurrentBusiness = cache(async (): Promise<Business | null> => {
  const session = await getSession();
  if (!session) return null;
  return getBusinessByOwnerId(session.user.id);
});

export async function requireBusiness(): Promise<Business> {
  await requireSession();
  const business = await getCurrentBusiness();
  if (!business) redirect("/setup");
  return business;
}
