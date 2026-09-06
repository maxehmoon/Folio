import { describe, expect, it } from "vitest";

import {
  isEmailSignInRequest,
  isPublicOwnerRegistration,
} from "./_utils";

describe("auth route classification", () => {
  it("blocks direct and encoded owner registration paths", () => {
    expect(
      isPublicOwnerRegistration({
        url: "http://localhost/api/auth/sign-up/email/",
      }),
    ).toBe(true);
    expect(
      isPublicOwnerRegistration({
        url: "http://localhost/api/auth/sign-up/%65mail",
      }),
    ).toBe(true);
  });

  it("recognises canonical and encoded email sign-in paths", () => {
    expect(
      isEmailSignInRequest({
        url: "http://localhost/api/auth/sign-in/email/",
      }),
    ).toBe(true);
    expect(
      isEmailSignInRequest({
        url: "http://localhost/api/auth/sign-in/%65mail",
      }),
    ).toBe(true);
  });

  it("does not classify unrelated auth paths as email sign-in", () => {
    expect(
      isEmailSignInRequest({
        url: "http://localhost/api/auth/change-password",
      }),
    ).toBe(false);
  });
});
