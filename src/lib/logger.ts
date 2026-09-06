import "server-only";

const numericFields = [
  "durationMs",
  "status",
  "count",
  "generated",
  "failed",
  "due",
  "skipped",
  "capped",
  "intervalMs",
] as const;

export type DebugFields = Partial<
  Record<(typeof numericFields)[number], number>
> & {
  hasOwner?: boolean;
  databaseDialect?: "sqlite" | "postgres";
  appSecretSource?: "provided" | "persisted" | "generated";
};

// Use constant event names and aggregate metadata, never request or business data.
export function debugLog(event: string, fields: DebugFields = {}): void {
  if (!/^(1|true)$/i.test(process.env.DEBUG?.trim() ?? "")) return;

  const safeFields: Record<string, string | number | boolean> = {};
  for (const key of numericFields) {
    const value = fields[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      safeFields[key] = value;
    }
  }
  if (typeof fields.hasOwner === "boolean") {
    safeFields.hasOwner = fields.hasOwner;
  }
  if (
    fields.databaseDialect === "sqlite" ||
    fields.databaseDialect === "postgres"
  ) {
    safeFields.databaseDialect = fields.databaseDialect;
  }
  if (
    fields.appSecretSource === "provided" ||
    fields.appSecretSource === "persisted" ||
    fields.appSecretSource === "generated"
  ) {
    safeFields.appSecretSource = fields.appSecretSource;
  }

  console.info(`[Folio debug] ${event}`, safeFields);
}
