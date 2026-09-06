import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StatusBadgeProps = Omit<ComponentProps<"span">, "children"> & {
  status: string;
  label?: string;
  tone?: StatusTone;
};

const STATUS_TONES: Record<string, StatusTone> = {
  active: "success",
  completed: "success",
  paid: "success",
  recorded: "success",
  sent: "info",
  scheduled: "info",
  pending: "info",
  processing: "info",
  due: "warning",
  overdue: "warning",
  partial: "warning",
  failed: "danger",
  void: "danger",
  cancelled: "danger",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-background text-info",
  success: "bg-success-background text-success",
  warning: "bg-warning-background text-warning",
  danger: "bg-danger-background text-destructive",
};

function titleCaseStatus(status: string) {
  return status
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
  ...props
}: StatusBadgeProps) {
  const normalisedStatus = status.trim().toLowerCase();
  const resolvedTone = tone ?? STATUS_TONES[normalisedStatus] ?? "neutral";

  return (
    <span
      data-status={normalisedStatus}
      className={cn(
        "inline-flex min-h-5 w-fit items-center rounded-full px-2 py-0.5 text-[12px] font-medium leading-4 whitespace-nowrap",
        TONE_CLASSES[resolvedTone],
        className,
      )}
      {...props}
    >
      {label ?? titleCaseStatus(status)}
    </span>
  );
}
