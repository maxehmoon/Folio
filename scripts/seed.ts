import { loadScriptEnvironment } from "./environment";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to seed the owner account.`);
  return value;
}

async function main(): Promise<void> {
  await loadScriptEnvironment();
  const [ownerSetup, database, businesses] = await Promise.all([
    import("@/lib/setup/owner-bootstrap"),
    import("@/lib/db"),
    import("@/lib/db/businesses"),
  ]);

  try {
    await database.migrateDatabase();

    const existingOwner = await ownerSetup.getOwnerIdentity();
    if (existingOwner) {
      await businesses.ensureBusinessForUser({
        userId: existingOwner.id,
        name: existingOwner.name,
        email: existingOwner.email,
      });
      console.info("Folio already has an owner; business setup verified.");
      return;
    }

    const name = requiredEnvironmentValue("SEED_OWNER_NAME");
    const email = requiredEnvironmentValue("SEED_OWNER_EMAIL").toLowerCase();
    const password = requiredEnvironmentValue("SEED_OWNER_PASSWORD");
    const result = await ownerSetup.createOwnerOnce(
      { name, email, password },
      // Seeding has no browser origin; the generated session cookie is unused.
      new Request("http://localhost:3000/api/setup/owner"),
    );
    if (result.status !== "created") {
      throw new Error("Owner setup is already in progress or could not complete.");
    }

    await businesses.ensureBusinessForUser({
      userId: result.userId,
      name,
      email,
    });

    console.info(`Created the Folio owner ${email}.`);
  } finally {
    await database.closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
