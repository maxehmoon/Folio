import { AlertCircleIcon, CheckCircle2Icon } from "@/components/ui/icons"

import { cn } from "@/lib/utils"

type InlineNoticeProps = {
  children: React.ReactNode
  id?: string
  tone?: "error" | "success"
}

export function InlineNotice({ children, id, tone = "error" }: InlineNoticeProps) {
  const Icon = tone === "success" ? CheckCircle2Icon : AlertCircleIcon

  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-5 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-5",
        tone === "success"
          ? "border-success/20 bg-success-background text-success dark:border-transparent"
          : "border-destructive/20 bg-danger-background text-destructive dark:border-transparent",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
      <span>{children}</span>
    </div>
  )
}
