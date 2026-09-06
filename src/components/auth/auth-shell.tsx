import type { ReactNode } from "react"
import { FolioMark } from "@/components/folio/folio-mark"

type AuthShellProps = {
  children: ReactNode
  description: string
  title: string
}

export function AuthShell({
  children,
  description,
  title,
}: AuthShellProps) {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground sm:px-6">
      <div aria-hidden="true" className="auth-shell-glow" />

      <div className="relative w-full max-w-[420px]">
        <div
          aria-label="Folio"
          className="mb-6 flex items-center justify-center gap-2.5"
        >
          <span className="grid size-8 place-items-center rounded-[9px] bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
            <FolioMark className="h-4 w-auto" />
          </span>
          <span className="text-[14px] font-medium tracking-[-0.15px]">
            Folio
          </span>
        </div>

        <section className="rounded-2xl border border-foreground/[0.07] bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_rgba(0,0,0,0.035)] sm:p-6">
          <header className="mb-6">
            <h1 className="text-balance text-[24px] font-medium leading-7 tracking-[-0.15px] text-foreground">
              {title}
            </h1>
            <p className="mt-2 max-w-[56ch] text-pretty text-[13px] leading-5 text-muted-foreground">
              {description}
            </p>
          </header>

          {children}
        </section>
      </div>
    </main>
  )
}
