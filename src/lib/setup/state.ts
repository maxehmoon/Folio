import type { Business } from "@/lib/db/types";
import { getBusinessByOwnerId } from "@/lib/db/businesses";
import { getSession } from "@/lib/session";
import { hasOwner } from "@/lib/setup/owner-claim";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type InstallationState =
  | { status: "needs-owner" }
  | { status: "signed-out" }
  | { status: "needs-business"; session: Session }
  | { status: "ready"; business: Business; session: Session };

export async function getInstallationState(): Promise<InstallationState> {
  const [ownerExists, session] = await Promise.all([hasOwner(), getSession()]);

  if (!ownerExists) return { status: "needs-owner" };
  if (!session) return { status: "signed-out" };

  const business = await getBusinessByOwnerId(session.user.id);
  return business
    ? { status: "ready", business, session }
    : { status: "needs-business", session };
}
