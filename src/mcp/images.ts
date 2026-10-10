import { z } from "zod";

import { IMAGE_UPLOAD_MAX_BYTES, validateImageUpload } from "@/lib/image-upload";

const imageError = "Use a base64 PNG, JPEG or WebP data URL of at most 512 KB.";

export const imageDataUrlSchema = z
  .string()
  .max(Math.ceil(IMAGE_UPLOAD_MAX_BYTES / 3) * 4 + 32)
  .refine((value) => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== match[2]) return false;
    return !validateImageUpload(
      { type: match[1], size: bytes.length },
      { invalidTypeMessage: imageError, oversizedMessage: imageError },
    );
  }, imageError)
  .describe("Base64 data URL for a PNG, JPEG or WebP image, at most 512 KB decoded.");
