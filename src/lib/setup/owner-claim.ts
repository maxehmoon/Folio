import { db, newId, nowIso } from "@/lib/db";

export type OwnerIdentity = {
  email: string;
  id: string;
  name: string;
};

export async function getOwnerIdentity(): Promise<OwnerIdentity | null> {
  return (
    (await db
      .selectFrom("auth_user")
      .select(["id", "name", "email"])
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export async function hasOwner(): Promise<boolean> {
  return Boolean(await getOwnerIdentity());
}

export async function claimOwnerSetup(): Promise<string | null> {
  const claimId = newId();
  const staleBefore = nowIso(new Date(Date.now() - 15 * 60 * 1_000));

  await db
    .deleteFrom("owner_setup_claims")
    .where("singleton_key", "=", "owner")
    .where("claimed_at", "<", staleBefore)
    .execute();

  const claim = await db
    .insertInto("owner_setup_claims")
    .values({
      singleton_key: "owner",
      claim_id: claimId,
      claimed_at: nowIso(),
    })
    .onConflict((conflict) => conflict.column("singleton_key").doNothing())
    .returning("claim_id")
    .executeTakeFirst();

  return claim?.claim_id === claimId ? claimId : null;
}

export async function releaseOwnerSetupClaim(claimId: string): Promise<void> {
  await db
    .deleteFrom("owner_setup_claims")
    .where("singleton_key", "=", "owner")
    .where("claim_id", "=", claimId)
    .execute();
}
