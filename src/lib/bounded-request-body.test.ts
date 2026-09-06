import { describe, expect, it } from "vitest";

import {
  readBoundedRequestBody,
  readBoundedUrlEncodedBody,
  RequestBodyTooLargeError,
  UnsupportedRequestMediaTypeError,
} from "./bounded-request-body";

describe("bounded request bodies", () => {
  it("rejects an oversized declared length without consuming the body", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": "1025" },
      body: "small",
    });

    await expect(readBoundedRequestBody(request, 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    expect(request.bodyUsed).toBe(false);
  });

  it("enforces the actual streamed bytes when length is absent or false", async () => {
    const absent = new Request("http://localhost/upload", {
      method: "POST",
      body: "x".repeat(1025),
    });
    const falseLength = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": "1" },
      body: "x".repeat(1025),
    });

    await expect(readBoundedRequestBody(absent, 1024)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
    await expect(
      readBoundedRequestBody(falseLength, 1024),
    ).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("parses a bounded native form submission", async () => {
    const request = new Request("http://localhost/setup", {
      method: "POST",
      body: new URLSearchParams({ name: "Renée", setupToken: "token" }),
    });

    const body = await readBoundedUrlEncodedBody(request, 1024);
    expect(body.get("name")).toBe("Renée");
    expect(body.get("setupToken")).toBe("token");
  });

  it("rejects multipart before consuming it", async () => {
    const request = new Request("http://localhost/setup", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: "--test\r\n",
    });

    await expect(
      readBoundedUrlEncodedBody(request, 1024),
    ).rejects.toBeInstanceOf(UnsupportedRequestMediaTypeError);
    expect(request.bodyUsed).toBe(false);
  });
});
