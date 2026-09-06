export const BUSINESS_ICON_MAX_BYTES = 512 * 1024;

export const BUSINESS_ICON_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const BUSINESS_ICON_ACCEPT = BUSINESS_ICON_TYPES.join(",");

const acceptedTypes = new Set<string>(BUSINESS_ICON_TYPES);

export type BusinessIconValidationError = "unsupported-type" | "too-large";

export function validateBusinessIcon(file: {
  size: number;
  type: string;
}): BusinessIconValidationError | null {
  if (!acceptedTypes.has(file.type)) return "unsupported-type";
  if (file.size > BUSINESS_ICON_MAX_BYTES) return "too-large";
  return null;
}

export function businessIconErrorMessage(
  error: BusinessIconValidationError,
): string {
  return error === "unsupported-type"
    ? "Choose a PNG, JPEG or WebP image."
    : "Keep the organisation icon under 512 KB.";
}
