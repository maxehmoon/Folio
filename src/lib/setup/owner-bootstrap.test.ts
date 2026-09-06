import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimOwnerSetup: vi.fn(),
  getOwnerIdentity: vi.fn(),
  hasOwner: vi.fn(),
  releaseOwnerSetupClaim: vi.fn(),
  signUpEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { signUpEmail: mocks.signUpEmail } }),
}));
vi.mock("@/lib/setup/owner-claim", () => ({
  claimOwnerSetup: mocks.claimOwnerSetup,
  getOwnerIdentity: mocks.getOwnerIdentity,
  hasOwner: mocks.hasOwner,
  releaseOwnerSetupClaim: mocks.releaseOwnerSetupClaim,
}));

import { createOwnerOnce } from "@/lib/setup/owner-bootstrap";

const owner = {
  email: "owner@example.com",
  name: "Owner",
  password: "correct horse battery staple",
};

function ownerRequest() {
  return new Request("http://folio.test:3000/api/setup/owner");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimOwnerSetup.mockResolvedValue("claim-1");
  mocks.hasOwner.mockResolvedValue(false);
  mocks.releaseOwnerSetupClaim.mockResolvedValue(undefined);
  mocks.signUpEmail.mockResolvedValue({
    headers: new Headers({ "set-cookie": "folio.session=test" }),
    response: { user: { id: "owner-1" } },
  });
});

describe("createOwnerOnce", () => {
  it("reports contention without touching owner state", async () => {
    mocks.claimOwnerSetup.mockResolvedValue(null);

    await expect(createOwnerOnce(owner, ownerRequest())).resolves.toEqual({
      status: "contended",
    });
    expect(mocks.hasOwner).not.toHaveBeenCalled();
    expect(mocks.releaseOwnerSetupClaim).not.toHaveBeenCalled();
  });

  it("rechecks owner state after claiming and always releases the claim", async () => {
    mocks.hasOwner.mockResolvedValue(true);

    await expect(createOwnerOnce(owner, ownerRequest())).resolves.toEqual({
      status: "already-exists",
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expect(mocks.releaseOwnerSetupClaim).toHaveBeenCalledWith("claim-1");
  });

  it("creates the owner and releases the claim", async () => {
    const result = await createOwnerOnce(owner, ownerRequest());

    expect(result).toMatchObject({
      status: "created",
      userId: "owner-1",
    });
    expect(result.status === "created" && result.headers.get("set-cookie")).toBe(
      "folio.session=test",
    );
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: owner,
      headers: expect.any(Headers),
      returnHeaders: true,
    });
    expect(mocks.releaseOwnerSetupClaim).toHaveBeenCalledWith("claim-1");
  });

  it("releases the claim when account creation fails", async () => {
    mocks.signUpEmail.mockRejectedValue(new Error("sign-up failed"));

    await expect(createOwnerOnce(owner, ownerRequest())).resolves.toEqual({
      status: "failed",
    });
    expect(mocks.releaseOwnerSetupClaim).toHaveBeenCalledWith("claim-1");
  });
});
