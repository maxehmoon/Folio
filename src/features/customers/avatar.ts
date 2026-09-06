import type { ImageUploadConfig } from "@/lib/image-upload";

export const customerAvatarUpload = {
  fieldName: "avatar",
  removeFieldName: "remove_avatar",
  invalidTypeMessage: "Choose a PNG, JPEG or WebP image.",
  oversizedMessage: "Keep the customer icon under 512 KB.",
} satisfies ImageUploadConfig;
