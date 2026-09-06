import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getExchangeRate,
  MAX_EXCHANGE_RATE_RESPONSE_BYTES,
} from "./exchange-rates";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("exchange-rate provider boundary", () => {
  it("keeps valid responses on the fixed origin and refuses redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(JSON.stringify({ date: "2026-09-04", rate: 1.25 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeRate("GBP", "EUR")).resolves.toMatchObject({
      date: "2026-09-04",
      rateMicros: 1_250_000,
      source: "ECB",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe("https://api.frankfurter.dev");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
  });

  it("rejects declared oversized responses on both provider attempts", async () => {
    const response = () =>
      jsonResponse("{}", {
        "content-length": String(MAX_EXCHANGE_RATE_RESPONSE_BYTES + 1),
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeRate("GBP", "EUR")).rejects.toThrow(
      "response is too large",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized streamed bodies without a Content-Length", async () => {
    const response = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new Uint8Array(MAX_EXCHANGE_RATE_RESPONSE_BYTES + 1),
            );
            controller.close();
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response()),
    );

    await expect(getExchangeRate("GBP", "EUR")).rejects.toThrow(
      "response is too large",
    );
  });

  it("rejects non-JSON provider bodies", async () => {
    const response = () =>
      new Response("not json", { headers: { "content-type": "text/plain" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response()),
    );

    await expect(getExchangeRate("GBP", "EUR")).rejects.toThrow(
      "non-JSON",
    );
  });

  it("keeps the aggregate fallback inside the same bounded origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse(JSON.stringify({ date: "2026-09-04", rate: 1.2 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeRate("GBP", "EUR")).resolves.toMatchObject({
      rateMicros: 1_200_000,
      source: "Frankfurter",
    });
    const [fallbackUrl, fallbackOptions] = fetchMock.mock.calls[1] as [
      URL,
      RequestInit,
    ];
    expect(fallbackUrl.origin).toBe("https://api.frankfurter.dev");
    expect(fallbackUrl.searchParams.has("providers")).toBe(false);
    expect(fallbackOptions).toMatchObject({
      cache: "no-store",
      redirect: "error",
    });
  });
});
