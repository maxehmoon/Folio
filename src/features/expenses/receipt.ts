import type { Expense } from "@/lib/db/types";
import type {
  ImageUploadChange,
  ImageUploadConfig,
} from "@/lib/image-upload";

export const receiptImageUpload = {
  fieldName: "receipt_image",
  removeFieldName: "remove_receipt_image",
  invalidTypeMessage: "Choose a PNG, JPEG or WebP receipt image.",
  oversizedMessage: "Keep the receipt image under 512 KB.",
} satisfies ImageUploadConfig;

type ReceiptRecord = Pick<Expense, "receipt_data_url" | "receipt_url">;

export type ExpenseReceipt =
  | { kind: "image"; url: string }
  | { kind: "legacy-link"; url: string }
  | null;

export function expenseReceipt(record: ReceiptRecord): ExpenseReceipt {
  if (record.receipt_data_url) {
    return { kind: "image", url: record.receipt_data_url };
  }
  if (record.receipt_url) {
    return { kind: "legacy-link", url: record.receipt_url };
  }
  return null;
}

export function receiptColumns(
  existing: ReceiptRecord,
  change: Exclude<ImageUploadChange, { kind: "invalid" }>,
): ReceiptRecord {
  if (change.kind === "unchanged") return existing;
  if (change.kind === "replace") {
    return { receipt_data_url: change.dataUrl, receipt_url: null };
  }
  return { receipt_data_url: null, receipt_url: null };
}
