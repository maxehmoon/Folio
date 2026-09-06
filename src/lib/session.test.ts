import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
  getAuth: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies, headers: mocks.headers }));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/lib/db/businesses", () => ({ getBusinessByOwnerId: vi.fn() }));

import { getSession } from "./session";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({
    host: "folio.example.com",
    "x-forwarded-proto": "https",
    cookie: "__Secure-folio.session_token=revoked",
  }));
  mocks.getAuth.mockReturnValue({ api: { getSession: mocks.getSession } });
  mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
});

describe("server-rendered sessions", () => {
  it("reads a replacement cookie written by a server action", async () => {
    mocks.cookies.mockResolvedValue({
      toString: () => "__Secure-folio.session_token=replacement",
    });
    await expect(getSession()).resolves.toEqual({ user: { id: "owner" } });
    const requestHeaders = mocks.getAuth.mock.calls[0][0] as Headers;
    expect(requestHeaders.get("cookie")).toBe("__Secure-folio.session_token=replacement");
    expect(requestHeaders.get("host")).toBe("folio.example.com");
    expect(requestHeaders.get("x-forwarded-proto")).toBe("https");
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: requestHeaders });
  });

  it("does not reuse an original cookie after the cookie store removes it", async () => {
    mocks.cookies.mockResolvedValue({ toString: () => "" });
    await getSession();
    expect(mocks.getAuth.mock.calls[0][0].get("cookie")).toBe("");
  });
});
