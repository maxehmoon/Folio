import { describe, expect, it } from "vitest";

import {
  ownerEmailSchema,
  ownerNameSchema,
  ownerPasswordSchema,
} from "./schema";

describe("owner account schemas", () => {
  it("normalises the owner name and email", () => {
    expect(ownerNameSchema.parse({ name: "  Max Moon  " })).toEqual({
      name: "Max Moon",
    });
    expect(
      ownerEmailSchema.parse({
        currentPassword: "current-password",
        email: "  MAX@EXAMPLE.COM ",
      }),
    ).toEqual({
      currentPassword: "current-password",
      email: "max@example.com",
    });
  });

  it("requires matching passwords of at least eight characters", () => {
    expect(
      ownerPasswordSchema.safeParse({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmPassword: "different-password",
      }).success,
    ).toBe(false);
    expect(
      ownerPasswordSchema.safeParse({
        currentPassword: "current-password",
        newPassword: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
  });
});
