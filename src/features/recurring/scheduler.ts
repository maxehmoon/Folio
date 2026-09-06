import "server-only";

import { runRecurringTicksOnceAt } from "@/features/recurring/execution";
import type { RecurringBusinessTickResult } from "@/features/recurring/service";
import { debugLog } from "@/lib/logger";

export const RECURRING_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

type RecurringRunner = () => Promise<RecurringBusinessTickResult | null>;

type SchedulerState = {
  running: boolean;
  timer?: NodeJS.Timeout;
};

const schedulerGlobal = globalThis as typeof globalThis & {
  __folioRecurringScheduler?: SchedulerState;
};

async function runTick(state: SchedulerState, run: RecurringRunner) {
  if (state.running) {
    debugLog("recurring.check.already-running");
    return;
  }
  state.running = true;
  const startedAt = performance.now();

  try {
    const result = await run();
    if (!result) {
      debugLog("recurring.check.skipped", {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }
    debugLog("recurring.check.completed", {
      durationMs: Math.round(performance.now() - startedAt),
      due: result.due,
      generated: result.generated,
      skipped: result.skipped,
      failed: result.failed,
      capped: result.capped,
    });
    if (result.generated > 0) {
      console.info(
        `Generated ${result.generated} recurring ${result.generated === 1 ? "invoice" : "invoices"}.`,
      );
    }
    if (result.failed > 0) {
      console.error(
        `Recurring invoice check finished with ${result.failed} ${result.failed === 1 ? "failure" : "failures"}.`,
      );
    }
  } catch {
    console.error("Recurring invoice check failed.");
    debugLog("recurring.check.failed", {
      durationMs: Math.round(performance.now() - startedAt),
    });
  } finally {
    state.running = false;
  }
}

export function startRecurringScheduler(
  run: RecurringRunner = async () => {
    const execution = await runRecurringTicksOnceAt();
    return execution.status === "completed" ? execution.result : null;
  },
): void {
  if (schedulerGlobal.__folioRecurringScheduler) return;

  const state: SchedulerState = { running: false };
  schedulerGlobal.__folioRecurringScheduler = state;
  debugLog("recurring.scheduler.started", {
    intervalMs: RECURRING_CHECK_INTERVAL_MS,
  });
  void runTick(state, run);

  state.timer = setInterval(() => {
    void runTick(state, run);
  }, RECURRING_CHECK_INTERVAL_MS);
  state.timer.unref();
}

export function stopRecurringScheduler(): void {
  const state = schedulerGlobal.__folioRecurringScheduler;
  if (!state) return;
  if (state.timer) clearInterval(state.timer);
  delete schedulerGlobal.__folioRecurringScheduler;
}
