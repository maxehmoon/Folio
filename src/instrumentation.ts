export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const startedAt = performance.now();
  const [
    { ensureRuntimeSecrets },
    { firstRunSetupMessage },
    { debugLog },
    { readSetupDefaults },
  ] = await Promise.all([
    import("@/lib/setup/runtime-secrets"),
    import("@/lib/setup/boot-message"),
    import("@/lib/logger"),
    import("@/lib/setup/defaults"),
  ]);
  debugLog("startup.started");
  readSetupDefaults();
  const appSecretProvided = Boolean(
    process.env.APP_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim(),
  );
  const runtimeSecrets = await ensureRuntimeSecrets();
  debugLog("startup.secrets.ready", {
    appSecretSource: appSecretProvided
      ? "provided"
      : runtimeSecrets.authenticationSecretCreated
        ? "generated"
        : "persisted",
  });
  const [{ hasOwner }, database] = await Promise.all([
    import("@/lib/setup/owner-claim"),
    import("@/lib/db"),
  ]);

  const migrationStartedAt = performance.now();
  await database.migrateDatabase();
  debugLog("startup.database.ready", {
    databaseDialect: database.getDatabaseDialect(),
    durationMs: Math.round(performance.now() - migrationStartedAt),
  });
  const ownerExists = await hasOwner();
  const message = firstRunSetupMessage({
    hasOwner: ownerExists,
    setupToken: runtimeSecrets.setupToken,
  });

  console.info(`Folio database ready (${database.getDatabaseDialect()}).`);
  if (runtimeSecrets.authenticationSecretCreated) {
    console.info(
      `Generated a persistent app secret in ${runtimeSecrets.configDirectory}.`,
    );
  }
  if (message) console.info(message);

  const { startRecurringScheduler } = await import(
    "@/features/recurring/scheduler"
  );
  startRecurringScheduler();
  debugLog("startup.ready", {
    hasOwner: ownerExists,
    durationMs: Math.round(performance.now() - startedAt),
  });
}
