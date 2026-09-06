import { z } from "zod";

export const ownerNameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const ownerEmailSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  email: z.string().trim().toLowerCase().email().max(254),
});

export const ownerPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((account) => account.newPassword === account.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
