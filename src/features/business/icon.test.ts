import { describe, expect, it } from "vitest";

import {
  BUSINESS_ICON_MAX_BYTES,
  businessIconErrorMessage,
  validateBusinessIcon,
} from "@/features/business/icon";
import { readBusinessIcon } from "@/features/business/icon.server";

describe("business icons", () => {
  it("turns an accepted image into a portable data URL", async () => {
    const formData = new FormData();
    formData.set(
      "icon",
      new File([new Uint8Array([137, 80, 78, 71])], "mark.png", {
        type: "image/png",
      }),
    );

    await expect(readBusinessIcon(formData)).resolves.toEqual({
      status: "replace",
      dataUrl: "data:image/png;base64,iVBORw==",
    });
  });

  it("rejects unsupported and oversized uploads", async () => {
    const unsupported = new FormData();
    unsupported.set(
      "icon",
      new File(["<svg />"], "mark.svg", { type: "image/svg+xml" }),
    );
    await expect(readBusinessIcon(unsupported)).resolves.toEqual({
      reason: "unsupported-type",
      status: "error",
    });

    const oversized = new FormData();
    oversized.set(
      "icon",
      new File([new Uint8Array(BUSINESS_ICON_MAX_BYTES + 1)], "mark.png", {
        type: "image/png",
      }),
    );
    await expect(readBusinessIcon(oversized)).resolves.toEqual({
      reason: "too-large",
      status: "error",
    });
  });

  it("supports explicitly removing an existing icon", async () => {
    const formData = new FormData();
    formData.set("removeLogo", "1");

    await expect(readBusinessIcon(formData)).resolves.toEqual({
      status: "remove",
    });
  });

  it("distinguishes an unchanged upload from removal", async () => {
    await expect(readBusinessIcon(new FormData())).resolves.toEqual({
      status: "unchanged",
    });
  });

  it("shares browser-safe validation copy", () => {
    expect(validateBusinessIcon({ size: 1, type: "image/svg+xml" })).toBe(
      "unsupported-type",
    );
    expect(businessIconErrorMessage("unsupported-type")).toBe(
      "Choose a PNG, JPEG or WebP image.",
    );
  });
});
