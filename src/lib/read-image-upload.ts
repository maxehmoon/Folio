import { Buffer } from "node:buffer";

import {
  validateImageUpload,
  type ImageUploadChange,
  type ImageUploadConfig,
} from "@/lib/image-upload";

export async function readImageUpload(
  formData: FormData,
  config: ImageUploadConfig,
): Promise<ImageUploadChange> {
  if (formData.get(config.removeFieldName) === "1") {
    return { kind: "remove" };
  }

  const upload = formData.get(config.fieldName);
  if (!(upload instanceof File) || upload.size === 0) {
    return { kind: "unchanged" };
  }

  const error = validateImageUpload(upload, config);
  if (error) return { kind: "invalid", error };

  const encoded = Buffer.from(await upload.arrayBuffer()).toString("base64");
  return {
    kind: "replace",
    dataUrl: `data:${upload.type};base64,${encoded}`,
  };
}
