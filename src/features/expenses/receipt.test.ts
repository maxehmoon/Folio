import { describe, expect, it } from "vitest";

import {
  expenseReceipt,
  receiptColumns,
  receiptImageUpload,
} from "./receipt";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/image-upload";
import { readImageUpload } from "@/lib/read-image-upload";

describe("expense receipt uploads", () => {
  it("encodes supported uploads as data URLs", async () => {
    const formData = new FormData();
    formData.set(
      "receipt_image",
      new File([new Uint8Array([137, 80, 78, 71])], "receipt.png", {
        type: "image/png",
      }),
    );

    await expect(readImageUpload(formData, receiptImageUpload)).resolves.toEqual({
      kind: "replace",
      dataUrl: "data:image/png;base64,iVBORw==",
    });
  });

  it("rejects unsupported and oversized uploads", async () => {
    const unsupported = new FormData();
    unsupported.set(
      "receipt_image",
      new File(["<svg />"], "receipt.svg", { type: "image/svg+xml" }),
    );
    await expect(readImageUpload(unsupported, receiptImageUpload)).resolves.toEqual({
      kind: "invalid",
      error: "Choose a PNG, JPEG or WebP receipt image.",
    });

    const oversized = new FormData();
    oversized.set(
      "receipt_image",
      new File([new Uint8Array(IMAGE_UPLOAD_MAX_BYTES + 1)], "receipt.png", {
        type: "image/png",
      }),
    );
    await expect(readImageUpload(oversized, receiptImageUpload)).resolves.toEqual({
      kind: "invalid",
      error: "Keep the receipt image under 512 KB.",
    });
  });

  it("supports removing an existing receipt", async () => {
    const formData = new FormData();
    formData.set("remove_receipt_image", "1");

    await expect(readImageUpload(formData, receiptImageUpload)).resolves.toEqual({
      kind: "remove",
    });
  });

  it("keeps legacy receipt links behind one compatibility adapter", () => {
    const legacy = { receipt_data_url: null, receipt_url: "https://example.com/receipt" };

    expect(expenseReceipt(legacy)).toEqual({
      kind: "legacy-link",
      url: "https://example.com/receipt",
    });
    expect(receiptColumns(legacy, { kind: "unchanged" })).toEqual(legacy);
    expect(receiptColumns(legacy, { kind: "remove" })).toEqual({
      receipt_data_url: null,
      receipt_url: null,
    });
  });
});
