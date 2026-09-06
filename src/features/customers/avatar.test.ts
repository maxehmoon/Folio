import { describe, expect, it } from "vitest";

import {
  customerAvatarUpload,
} from "./avatar";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/image-upload";
import { readImageUpload } from "@/lib/read-image-upload";

describe("customer avatars", () => {
  it("makes an omitted upload an explicit unchanged state", async () => {
    await expect(
      readImageUpload(new FormData(), customerAvatarUpload),
    ).resolves.toEqual({ kind: "unchanged" });
  });

  it("turns an accepted image into a portable data URL", async () => {
    const formData = new FormData();
    formData.set(
      "avatar",
      new File([new Uint8Array([1, 2, 3])], "icon.png", {
        type: "image/png",
      }),
    );

    await expect(readImageUpload(formData, customerAvatarUpload)).resolves.toEqual({
      kind: "replace",
      dataUrl: "data:image/png;base64,AQID",
    });
  });

  it("rejects unsupported and oversized uploads", async () => {
    const unsupported = new FormData();
    unsupported.set(
      "avatar",
      new File(["<svg />"], "icon.svg", { type: "image/svg+xml" }),
    );
    await expect(readImageUpload(unsupported, customerAvatarUpload)).resolves.toEqual({
      kind: "invalid",
      error: "Choose a PNG, JPEG or WebP image.",
    });

    const oversized = new FormData();
    oversized.set(
      "avatar",
      new File([new Uint8Array(IMAGE_UPLOAD_MAX_BYTES + 1)], "icon.webp", {
        type: "image/webp",
      }),
    );
    await expect(readImageUpload(oversized, customerAvatarUpload)).resolves.toEqual({
      kind: "invalid",
      error: "Keep the customer icon under 512 KB.",
    });
  });

  it("supports explicitly removing an existing icon", async () => {
    const formData = new FormData();
    formData.set("remove_avatar", "1");

    await expect(readImageUpload(formData, customerAvatarUpload)).resolves.toEqual({
      kind: "remove",
    });
  });
});
