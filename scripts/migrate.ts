import { loadScriptEnvironment } from "./environment";

async function main(): Promise<void> {
  await loadScriptEnvironment();
  const database = await import("@/lib/db");

  try {
    await database.migrateDatabase();
    console.info(
      `Folio database migrations completed (${database.getDatabaseDialect()}).`,
    );
  } finally {
    await database.closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
