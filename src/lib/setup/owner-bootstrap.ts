import { getAuth } from "@/lib/auth";
import {
  claimOwnerSetup,
  hasOwner,
  releaseOwnerSetupClaim,
} from "@/lib/setup/owner-claim";

export {
  getOwnerIdentity,
  hasOwner,
} from "@/lib/setup/owner-claim";

type OwnerAccount = {
  email: string;
  name: string;
  password: string;
};

export type OwnerBootstrapResult =
  | { status: "created"; headers: Headers; userId: string }
  | { status: "already-exists" }
  | { status: "contended" }
  | { status: "failed" };

export async function createOwnerOnce(
  owner: OwnerAccount,
  request: Request,
): Promise<OwnerBootstrapResult> {
  const claimId = await claimOwnerSetup();
  if (!claimId) return { status: "contended" };

  try {
    if (await hasOwner()) return { status: "already-exists" };

    const result = await getAuth(request).api.signUpEmail({
      body: owner,
      headers: request.headers,
      returnHeaders: true,
    });
    return {
      status: "created",
      headers: result.headers,
      userId: result.response.user.id,
    };
  } catch {
    return { status: "failed" };
  } finally {
    await releaseOwnerSetupClaim(claimId);
  }
}
