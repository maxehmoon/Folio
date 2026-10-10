import { describe, expect, it } from "vitest";

import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/image-upload";
import { imageDataUrlSchema } from "./images";

describe("MCP image upload schema", () => {
  it("applies the product image formats and decoded byte limit", () => {
    for (const type of ["png", "jpeg", "webp"]) {
      expect(imageDataUrlSchema.safeParse(`data:image/${type};base64,${Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES).toString("base64")}`).success).toBe(true);
    }
    expect(imageDataUrlSchema.safeParse(`data:image/png;base64,${Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1).toString("base64")}`).success).toBe(false);
  });

  it("rejects unsupported, remote, malformed, empty and non-canonical data URLs", () => {
    for (const value of [
      "https://example.com/image.png", "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,", "data:image/png;base64,aGVsbG8", "data:image/png;base64,aGVsbG8===",
      "data:image/png;base64,aGVsbG8=\n", "data:image/png;base64,%%%",
    ]) {
      expect(imageDataUrlSchema.safeParse(value).success).toBe(false);
    }
  });
});
