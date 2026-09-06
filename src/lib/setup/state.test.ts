import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBusinessByOwnerId: vi.fn(),
  getSession: vi.fn(),
  hasOwner: vi.fn(),
}));

vi.mock("@/lib/db/businesses", () => ({
  getBusinessByOwnerId: mocks.getBusinessByOwnerId,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/setup/owner-claim", () => ({ hasOwner: mocks.hasOwner }));

import { getInstallationState } from "@/lib/setup/state";

const session = {
  session: { id: "session-1" },
  user: { email: "owner@example.com", id: "owner-1" },
};
const business = { id: "business-1", owner_user_id: "owner-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasOwner.mockResolvedValue(true);
  mocks.getSession.mockResolvedValue(null);
  mocks.getBusinessByOwnerId.mockResolvedValue(null);
});

describe("getInstallationState", () => {
  it("requires owner setup before every other state", async () => {
    mocks.hasOwner.mockResolvedValue(false);
    mocks.getSession.mockResolvedValue(session);

    await expect(getInstallationState()).resolves.toEqual({
      status: "needs-owner",
    });
    expect(mocks.getBusinessByOwnerId).not.toHaveBeenCalled();
  });

  it("distinguishes signed-out and business-setup states", async () => {
    await expect(getInstallationState()).resolves.toEqual({
      status: "signed-out",
    });

    mocks.getSession.mockResolvedValue(session);
    await expect(getInstallationState()).resolves.toEqual({
      status: "needs-business",
      session,
    });
  });

  it("returns the ready installation with its business", async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.getBusinessByOwnerId.mockResolvedValue(business);

    await expect(getInstallationState()).resolves.toEqual({
      status: "ready",
      business,
      session,
    });
  });
});
