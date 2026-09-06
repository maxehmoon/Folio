import { Buffer } from "node:buffer";

import {
  type BusinessIconValidationError,
  validateBusinessIcon,
} from "@/features/business/icon";

export type BusinessIconUpload =
  | { status: "unchanged" }
  | { status: "remove" }
  | { status: "replace"; dataUrl: string }
  | { status: "error"; reason: BusinessIconValidationError };

export async function readBusinessIcon(
  formData: FormData,
): Promise<BusinessIconUpload> {
  if (formData.get("removeLogo") === "1") return { status: "remove" };

  const upload = formData.get("icon");
  if (!(upload instanceof File) || upload.size === 0) {
    return { status: "unchanged" };
  }

  const validationError = validateBusinessIcon(upload);
  if (validationError) return { status: "error", reason: validationError };

  const encoded = Buffer.from(await upload.arrayBuffer()).toString("base64");
  return {
    status: "replace",
    dataUrl: `data:${upload.type};base64,${encoded}`,
  };
}
