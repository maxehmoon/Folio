import type { ReactNode } from "react"
import { SetupProgress } from "@/components/auth/setup-progress"

type OnboardingShellProps = {
  children: ReactNode
  currentStep: number
  description: string
  title: string
}

export function OnboardingShell({
  children,
  currentStep,
  description,
  title,
}: OnboardingShellProps) {
  return (
    <main className="min-h-svh bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100svh-2.5rem)] w-full max-w-[1440px] overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_24px_80px_rgba(0,0,0,0.08)] sm:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.9fr)]">
        <aside className="flex flex-col border-b border-sidebar-border bg-sidebar p-6 text-sidebar-foreground sm:p-8 lg:border-b-0 lg:border-r lg:p-10 xl:p-12">
          <div className="text-[22px] font-medium tracking-[-0.035em]">
            Folio
          </div>

          <div className="my-auto py-10 lg:py-14">
            <p className="text-[12px] font-semibold text-muted-foreground">
              Workplace setup
            </p>
            <h2 className="mt-2 text-balance text-[27px] font-medium leading-8 tracking-[-0.03em]">
              Setup progress
            </h2>
            <p className="mt-3 max-w-[38ch] text-pretty text-[13px] leading-5 text-muted-foreground">
              Add the owner, organisation, address and invoice defaults. You
              can change them later in Settings.
            </p>

            <SetupProgress currentStep={currentStep} />
          </div>
        </aside>

        <section className="flex min-w-0 flex-col justify-center p-5 sm:p-8 lg:p-10 xl:p-14">
          <div className="mx-auto w-full max-w-[820px]">
            <header className="mb-7">
              <p className="text-[12px] font-semibold text-subtle-foreground">
                First-time setup
              </p>
              <h1 className="mt-2 text-balance text-[30px] font-medium leading-9 tracking-[-0.03em] text-foreground">
                {title}
              </h1>
              <p className="mt-2 max-w-[62ch] text-pretty text-[13px] leading-5 text-muted-foreground">
                {description}
              </p>
            </header>

            {children}
          </div>
        </section>
      </div>
    </main>
  )
}
