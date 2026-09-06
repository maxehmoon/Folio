import { afterEach, describe, expect, it, vi } from "vitest"

import { isSameOrigin, redirectFromSetup } from "./_utils"

function setupRequest(origin: string, fetchSite = "same-origin") {
  const host = new URL(origin).host
  return new Request("http://127.0.0.1:3000/api/setup/owner", {
    headers: {
      host,
      origin,
      "sec-fetch-site": fetchSite,
    },
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isSameOrigin", () => {
  it("accepts the request URL origin", () => {
    expect(isSameOrigin(setupRequest("http://127.0.0.1:3000"))).toBe(true)
  })

  it("rejects an untrusted origin", () => {
    const request = new Request("http://127.0.0.1:3000/api/setup/owner", {
      headers: {
        host: "folio.example.com",
        origin: "https://attacker.example",
        "sec-fetch-site": "same-origin",
        "x-forwarded-proto": "https",
      },
    })
    expect(isSameOrigin(request)).toBe(false)
  })

  it("rejects cross-site requests even when the origin is trusted", () => {
    expect(
      isSameOrigin(setupRequest("https://folio.example.com", "cross-site")),
    ).toBe(false)
  })
})

describe("redirectFromSetup", () => {
  it("keeps redirects relative to the browser-facing origin", () => {
    const request = new Request("http://0.0.0.0:3000/api/setup/owner")
    const response = redirectFromSetup(request, "/setup?step=organisation")

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/setup?step=organisation")
  })

  it("forwards the authenticated session headers", () => {
    const request = new Request("http://0.0.0.0:3000/api/setup/owner")
    const response = redirectFromSetup(request, "/setup", {
      "set-cookie": "folio.session=test; HttpOnly; SameSite=Lax",
    })

    expect(response.headers.get("set-cookie")).toContain("folio.session=test")
  })
})
