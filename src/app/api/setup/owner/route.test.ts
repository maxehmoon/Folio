import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOwnerOnce: vi.fn(),
  hasOwner: vi.fn(),
  requireSetupToken: vi.fn(),
}));

vi.mock("@/lib/setup/owner-bootstrap", () => ({
  createOwnerOnce: mocks.createOwnerOnce,
}));
vi.mock("@/lib/setup/owner-claim", () => ({
  hasOwner: mocks.hasOwner,
}));
vi.mock("@/lib/setup/runtime-secrets", () => ({
  requireSetupToken: mocks.requireSetupToken,
}));

import { POST } from "./route";

function ownerRequest(
  body: BodyInit,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://127.0.0.1:3000/api/setup/owner", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body,
  });
}

function validOwner(setupToken = "setup-token"): URLSearchParams {
  return new URLSearchParams({
    name: "Owner",
    email: "owner@example.com",
    password: "correct horse battery staple",
    confirmPassword: "correct horse battery staple",
    setupToken,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasOwner.mockResolvedValue(false);
  mocks.requireSetupToken.mockReturnValue("setup-token");
  mocks.createOwnerOnce.mockResolvedValue({
    status: "created",
    headers: new Headers({ "set-cookie": "folio.session=test" }),
    userId: "owner-1",
  });
});

describe("owner setup request boundary", () => {
  it("keeps the native bounded setup flow working", async () => {
    const response = await POST(ownerRequest(validOwner()));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/setup?step=organisation");
    expect(mocks.createOwnerOnce).toHaveBeenCalledWith(
      {
        name: "Owner",
        email: "owner@example.com",
        password: "correct horse battery staple",
      },
      expect.any(Request),
    );
  });

  it("rejects an oversized body before owner creation", async () => {
    const response = await POST(
      ownerRequest("name=Owner", {
        "content-length": String(16 * 1024 + 1),
        "content-type": "application/x-www-form-urlencoded",
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.createOwnerOnce).not.toHaveBeenCalled();
  });

  it("rejects multipart bodies rather than invoking an unbounded parser", async () => {
    const response = await POST(
      ownerRequest("--test\r\n", {
        "content-type": "multipart/form-data; boundary=test",
      }),
    );

    expect(response.status).toBe(415);
    expect(mocks.createOwnerOnce).not.toHaveBeenCalled();
  });

  it("preserves token validation for bounded submissions", async () => {
    const response = await POST(ownerRequest(validOwner("wrong-token")));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/setup?error=invalid-token");
    expect(mocks.createOwnerOnce).not.toHaveBeenCalled();
  });

  it("returns an inline error for enhanced setup submissions", async () => {
    const response = await POST(
      ownerRequest(validOwner("wrong-token"), {
        accept: "application/json",
      }),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "invalid-token",
      ok: false,
    });
    expect(mocks.createOwnerOnce).not.toHaveBeenCalled();
  });

  it("returns the next step without discarding the setup session", async () => {
    const response = await POST(
      ownerRequest(validOwner(), { accept: "application/json" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBe("folio.session=test");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/setup?step=organisation",
    });
  });
});
