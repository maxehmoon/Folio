export const IMAGE_UPLOAD_MAX_BYTES = 512 * 1024;

export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";

const IMAGE_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ImageUploadConfig = {
  fieldName: string;
  removeFieldName: string;
  invalidTypeMessage: string;
  oversizedMessage: string;
};

export type ImageUploadChange =
  | { kind: "unchanged" }
  | { kind: "remove" }
  | { kind: "replace"; dataUrl: string }
  | { kind: "invalid"; error: string };

export function validateImageUpload(
  file: Pick<File, "size" | "type">,
  config: Pick<ImageUploadConfig, "invalidTypeMessage" | "oversizedMessage">,
): string | undefined {
  if (!IMAGE_UPLOAD_TYPES.has(file.type)) return config.invalidTypeMessage;
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) return config.oversizedMessage;
  return undefined;
}
