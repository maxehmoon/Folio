import { loadEnvConfig } from "@next/env";

import { ensureRuntimeSecrets } from "@/lib/setup/runtime-secrets";

export async function loadScriptEnvironment(): Promise<void> {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  await ensureRuntimeSecrets();
}
