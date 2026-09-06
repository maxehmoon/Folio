import { describe, expect, it } from "vitest";

import { firstRunSetupMessage } from "@/lib/setup/boot-message";

describe("firstRunSetupMessage", () => {
  it("prints the configured token before an owner exists", () => {
    expect(
      firstRunSetupMessage({
        hasOwner: false,
        setupToken: "private-bootstrap-token",
      }),
    ).toContain("Setup token: private-bootstrap-token");
    expect(
      firstRunSetupMessage({
        hasOwner: false,
        setupToken: "private-bootstrap-token",
      }),
    ).toContain("Open /setup on this Folio instance.");
  });

  it("prints nothing after the owner is created", () => {
    expect(
      firstRunSetupMessage({
        hasOwner: true,
        setupToken: "private-bootstrap-token",
      }),
    ).toBeNull();
  });
});
