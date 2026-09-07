import { getMigrations as getBetterAuthMigrations } from "better-auth/db/migration";
import { PostgresAdapter, type Kysely, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";

import { authOptions } from "@/lib/auth";

import type { Database } from "./types";

const initialDomainMigration: Migration = {
  async up(database) {
    await database.schema
      .createTable("businesses")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("owner_user_id", "text", (column) =>
        column.notNull().unique().references("auth_user.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("legal_name", "text")
      .addColumn("email", "text", (column) => column.notNull())
      .addColumn("phone", "text")
      .addColumn("tax_id", "text")
      .addColumn("address_line_1", "text")
      .addColumn("address_line_2", "text")
      .addColumn("city", "text")
      .addColumn("region", "text")
      .addColumn("postal_code", "text")
      .addColumn("country_code", "text")
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("timezone", "text", (column) => column.notNull())
      .addColumn("invoice_prefix", "text", (column) => column.notNull())
      .addColumn("next_invoice_number", "integer", (column) => column.notNull())
      .addColumn("default_payment_terms_days", "integer", (column) =>
        column.notNull(),
      )
      .addColumn("payment_instructions", "text")
      .addColumn("invoice_footer", "text")
      .addColumn("logo_url", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint(
        "businesses_invoice_counter_positive",
        sql`next_invoice_number > 0`,
      )
      .addCheckConstraint(
        "businesses_payment_terms_nonnegative",
        sql`default_payment_terms_days >= 0`,
      )
      .execute();

    await database.schema
      .createTable("customers")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("contact_name", "text")
      .addColumn("email", "text")
      .addColumn("phone", "text")
      .addColumn("tax_id", "text")
      .addColumn("address_line_1", "text")
      .addColumn("address_line_2", "text")
      .addColumn("city", "text")
      .addColumn("region", "text")
      .addColumn("postal_code", "text")
      .addColumn("country_code", "text")
      .addColumn("notes", "text")
      .addColumn("archived_at", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .execute();

    await database.schema
      .createTable("items")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("description", "text")
      .addColumn("unit", "text", (column) => column.notNull())
      .addColumn("unit_price_cents", "integer", (column) => column.notNull())
      .addColumn("tax_rate_bps", "integer", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("archived_at", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint("items_price_nonnegative", sql`unit_price_cents >= 0`)
      .addCheckConstraint(
        "items_tax_rate_valid",
        sql`tax_rate_bps BETWEEN 0 AND 10000`,
      )
      .execute();

    await database.schema
      .createTable("recurring_invoices")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("customer_id", "text", (column) =>
        column.notNull().references("customers.id"),
      )
      .addColumn("state", "text", (column) => column.notNull())
      .addColumn("frequency", "text", (column) => column.notNull())
      .addColumn("interval_count", "integer", (column) => column.notNull())
      .addColumn("start_date", "text", (column) => column.notNull())
      .addColumn("end_date", "text")
      .addColumn("next_issue_date", "text", (column) => column.notNull())
      .addColumn("next_occurrence_index", "integer", (column) => column.notNull())
      .addColumn("payment_terms_days", "integer", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("notes", "text")
      .addColumn("payment_instructions", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint(
        "recurring_interval_positive",
        sql`interval_count > 0`,
      )
      .addCheckConstraint(
        "recurring_index_nonnegative",
        sql`next_occurrence_index >= 0`,
      )
      .addCheckConstraint(
        "recurring_terms_nonnegative",
        sql`payment_terms_days >= 0`,
      )
      .addCheckConstraint(
        "recurring_state_valid",
        sql`state IN ('active', 'paused', 'ended')`,
      )
      .addCheckConstraint(
        "recurring_frequency_valid",
        sql`frequency IN ('day', 'week', 'month', 'year')`,
      )
      .execute();

    await database.schema
      .createTable("recurring_invoice_lines")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("recurring_invoice_id", "text", (column) =>
        column.notNull().references("recurring_invoices.id").onDelete("cascade"),
      )
      .addColumn("item_id", "text", (column) =>
        column.references("items.id").onDelete("set null"),
      )
      .addColumn("position", "integer", (column) => column.notNull())
      .addColumn("description", "text", (column) => column.notNull())
      .addColumn("unit", "text", (column) => column.notNull())
      .addColumn("quantity_thousandths", "integer", (column) => column.notNull())
      .addColumn("unit_price_cents", "integer", (column) => column.notNull())
      .addColumn("tax_rate_bps", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint(
        "recurring_lines_quantity_positive",
        sql`quantity_thousandths > 0`,
      )
      .addCheckConstraint(
        "recurring_lines_price_nonnegative",
        sql`unit_price_cents >= 0`,
      )
      .addCheckConstraint(
        "recurring_lines_tax_rate_valid",
        sql`tax_rate_bps BETWEEN 0 AND 10000`,
      )
      .execute();

    await database.schema
      .createTable("invoices")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("customer_id", "text", (column) =>
        column.references("customers.id").onDelete("set null"),
      )
      .addColumn("recurring_invoice_id", "text", (column) =>
        column.references("recurring_invoices.id").onDelete("set null"),
      )
      .addColumn("recurrence_index", "integer")
      .addColumn("invoice_number", "text")
      .addColumn("lifecycle", "text", (column) => column.notNull())
      .addColumn("issue_date", "text")
      .addColumn("due_date", "text")
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("seller_name", "text", (column) => column.notNull())
      .addColumn("seller_email", "text")
      .addColumn("seller_tax_id", "text")
      .addColumn("seller_address", "text")
      .addColumn("customer_name", "text", (column) => column.notNull())
      .addColumn("customer_email", "text")
      .addColumn("customer_tax_id", "text")
      .addColumn("customer_address", "text")
      .addColumn("notes", "text")
      .addColumn("payment_instructions", "text")
      .addColumn("subtotal_cents", "integer", (column) => column.notNull())
      .addColumn("tax_cents", "integer", (column) => column.notNull())
      .addColumn("total_cents", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint(
        "invoices_totals_nonnegative",
        sql`subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0`,
      )
      .addCheckConstraint(
        "invoices_total_consistent",
        sql`total_cents = subtotal_cents + tax_cents`,
      )
      .addCheckConstraint(
        "invoices_lifecycle_valid",
        sql`lifecycle IN ('draft', 'issued', 'void')`,
      )
      .execute();

    await database.schema
      .createTable("invoice_lines")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("invoice_id", "text", (column) =>
        column.notNull().references("invoices.id").onDelete("cascade"),
      )
      .addColumn("item_id", "text", (column) =>
        column.references("items.id").onDelete("set null"),
      )
      .addColumn("position", "integer", (column) => column.notNull())
      .addColumn("description", "text", (column) => column.notNull())
      .addColumn("unit", "text", (column) => column.notNull())
      .addColumn("quantity_thousandths", "integer", (column) => column.notNull())
      .addColumn("unit_price_cents", "integer", (column) => column.notNull())
      .addColumn("tax_rate_bps", "integer", (column) => column.notNull())
      .addColumn("subtotal_cents", "integer", (column) => column.notNull())
      .addColumn("tax_cents", "integer", (column) => column.notNull())
      .addColumn("total_cents", "integer", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint(
        "invoice_lines_values_valid",
        sql`quantity_thousandths > 0 AND unit_price_cents >= 0 AND tax_rate_bps BETWEEN 0 AND 10000`,
      )
      .addCheckConstraint(
        "invoice_lines_totals_nonnegative",
        sql`subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0`,
      )
      .addCheckConstraint(
        "invoice_lines_total_consistent",
        sql`total_cents = subtotal_cents + tax_cents`,
      )
      .execute();

    await database.schema
      .createTable("payments")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("invoice_id", "text", (column) =>
        column.notNull().references("invoices.id").onDelete("cascade"),
      )
      .addColumn("payment_date", "text", (column) => column.notNull())
      .addColumn("amount_cents", "integer", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("method", "text", (column) => column.notNull())
      .addColumn("reference", "text")
      .addColumn("notes", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint("payments_amount_positive", sql`amount_cents > 0`)
      .addCheckConstraint(
        "payments_method_valid",
        sql`method IN ('bank_transfer', 'card', 'cash', 'cheque', 'other')`,
      )
      .execute();

    await database.schema
      .createTable("expenses")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("vendor", "text", (column) => column.notNull())
      .addColumn("category", "text", (column) => column.notNull())
      .addColumn("description", "text")
      .addColumn("expense_date", "text", (column) => column.notNull())
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("subtotal_cents", "integer", (column) => column.notNull())
      .addColumn("tax_cents", "integer", (column) => column.notNull())
      .addColumn("total_cents", "integer", (column) => column.notNull())
      .addColumn("reference", "text")
      .addColumn("notes", "text")
      .addColumn("receipt_url", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("updated_at", "text", (column) => column.notNull())
      .addCheckConstraint(
        "expenses_totals_nonnegative",
        sql`subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0`,
      )
      .addCheckConstraint(
        "expenses_total_consistent",
        sql`total_cents = subtotal_cents + tax_cents`,
      )
      .execute();

    await database.schema
      .createTable("recurring_runs")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("recurring_invoice_id", "text", (column) =>
        column.notNull().references("recurring_invoices.id").onDelete("cascade"),
      )
      .addColumn("invoice_id", "text", (column) =>
        column.references("invoices.id").onDelete("set null"),
      )
      .addColumn("occurrence_index", "integer", (column) => column.notNull())
      .addColumn("scheduled_date", "text", (column) => column.notNull())
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("error_message", "text")
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("completed_at", "text")
      .addCheckConstraint(
        "recurring_runs_index_nonnegative",
        sql`occurrence_index >= 0`,
      )
      .addCheckConstraint(
        "recurring_runs_status_valid",
        sql`status IN ('pending', 'completed', 'failed', 'skipped')`,
      )
      .execute();

    const indexes = [
      database.schema.createIndex("customers_business_archived_idx").on("customers").columns(["business_id", "archived_at"]),
      database.schema.createIndex("customers_business_name_idx").on("customers").columns(["business_id", "name"]),
      database.schema.createIndex("items_business_archived_idx").on("items").columns(["business_id", "archived_at"]),
      database.schema.createIndex("items_business_name_idx").on("items").columns(["business_id", "name"]),
      database.schema.createIndex("recurring_business_due_idx").on("recurring_invoices").columns(["business_id", "state", "next_issue_date"]),
      database.schema.createIndex("recurring_lines_position_uidx").unique().on("recurring_invoice_lines").columns(["recurring_invoice_id", "position"]),
      database.schema.createIndex("recurring_lines_business_idx").on("recurring_invoice_lines").columns(["business_id", "recurring_invoice_id"]),
      database.schema.createIndex("invoices_business_number_uidx").unique().on("invoices").columns(["business_id", "invoice_number"]),
      database.schema.createIndex("invoices_recurrence_uidx").unique().on("invoices").columns(["recurring_invoice_id", "recurrence_index"]),
      database.schema.createIndex("invoices_business_lifecycle_idx").on("invoices").columns(["business_id", "lifecycle", "issue_date"]),
      database.schema.createIndex("invoices_business_due_idx").on("invoices").columns(["business_id", "due_date"]),
      database.schema.createIndex("invoices_customer_idx").on("invoices").column("customer_id"),
      database.schema.createIndex("invoice_lines_position_uidx").unique().on("invoice_lines").columns(["invoice_id", "position"]),
      database.schema.createIndex("invoice_lines_business_idx").on("invoice_lines").columns(["business_id", "invoice_id"]),
      database.schema.createIndex("payments_business_invoice_date_idx").on("payments").columns(["business_id", "invoice_id", "payment_date"]),
      database.schema.createIndex("expenses_business_date_idx").on("expenses").columns(["business_id", "expense_date"]),
      database.schema.createIndex("recurring_runs_occurrence_uidx").unique().on("recurring_runs").columns(["recurring_invoice_id", "occurrence_index"]),
      database.schema.createIndex("recurring_runs_business_status_idx").on("recurring_runs").columns(["business_id", "status", "scheduled_date"]),
    ];

    for (const index of indexes) await index.execute();

  },
  async down(database) {
    const tables = [
      "recurring_runs",
      "expenses",
      "payments",
      "invoice_lines",
      "invoices",
      "recurring_invoice_lines",
      "recurring_invoices",
      "items",
      "customers",
      "businesses",
    ] as const;

    for (const table of tables) {
      await database.schema.dropTable(table).ifExists().execute();
    }
  },
};

const domainMigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "202607220001_initial_domain": initialDomainMigration,
      "202607220002_owner_setup_claim": {
        async up(database) {
          await database.schema
            .createTable("owner_setup_claims")
            .addColumn("singleton_key", "text", (column) =>
              column.primaryKey(),
            )
            .addColumn("claim_id", "text", (column) => column.notNull())
            .addColumn("claimed_at", "text", (column) => column.notNull())
            .execute();
        },
        async down(database) {
          await database.schema.dropTable("owner_setup_claims").ifExists().execute();
        },
      },
      "202607220003_customer_icons_and_invoice_fx": {
        async up(database) {
          await database.schema
            .alterTable("customers")
            .addColumn("avatar_data_url", "text")
            .execute();
          await database.schema
            .alterTable("customers")
            .addColumn("default_currency", "text")
            .execute();
          await database.schema
            .alterTable("invoices")
            .addColumn("base_currency", "text")
            .execute();
          await database.schema
            .alterTable("invoices")
            .addColumn("exchange_rate_micros", "integer")
            .execute();
          await database.schema
            .alterTable("invoices")
            .addColumn("exchange_rate_date", "text")
            .execute();
          await database.schema
            .alterTable("invoices")
            .addColumn("exchange_rate_source", "text")
            .execute();
        },
        async down(database) {
          await database.schema
            .alterTable("invoices")
            .dropColumn("exchange_rate_source")
            .execute();
          await database.schema
            .alterTable("customers")
            .dropColumn("default_currency")
            .execute();
          await database.schema
            .alterTable("invoices")
            .dropColumn("exchange_rate_date")
            .execute();
          await database.schema
            .alterTable("invoices")
            .dropColumn("exchange_rate_micros")
            .execute();
          await database.schema
            .alterTable("invoices")
            .dropColumn("base_currency")
            .execute();
          await database.schema
            .alterTable("customers")
            .dropColumn("avatar_data_url")
            .execute();
        },
      },
      "202608110001_expense_receipt_images": {
        async up(database) {
          await database.schema
            .alterTable("expenses")
            .addColumn("receipt_data_url", "text")
            .execute();
        },
        async down(database) {
          await database.schema
            .alterTable("expenses")
            .dropColumn("receipt_data_url")
            .execute();
        },
      },
      "202608140001_invoice_document_snapshot": {
        async up(database) {
          await database.schema
            .alterTable("invoices")
            .addColumn("seller_phone", "text")
            .execute();
          await database.schema
            .alterTable("invoices")
            .addColumn("invoice_footer", "text")
            .execute();
        },
        async down(database) {
          await database.schema
            .alterTable("invoices")
            .dropColumn("invoice_footer")
            .execute();
          await database.schema
            .alterTable("invoices")
            .dropColumn("seller_phone")
            .execute();
        },
      },
      "202608140002_exchange_rate_bigint": {
        async up(database) {
          if (!(database.getExecutor().adapter instanceof PostgresAdapter)) {
            return;
          }
          await sql`alter table invoices alter column exchange_rate_micros type bigint`.execute(
            database,
          );
        },
        async down(database) {
          if (!(database.getExecutor().adapter instanceof PostgresAdapter)) {
            return;
          }
          await sql`alter table invoices alter column exchange_rate_micros type integer`.execute(
            database,
          );
        },
      },
      "202608140003_invoice_customer_phone_snapshot": {
        async up(database) {
          await database.schema
            .alterTable("invoices")
            .addColumn("customer_phone", "text")
            .execute();
        },
        async down(database) {
          await database.schema
            .alterTable("invoices")
            .dropColumn("customer_phone")
            .execute();
        },
      },
      "202608140004_backfill_invoice_document_snapshot": {
        async up(database) {
          await sql`
            update invoices
            set seller_phone = coalesce(
                  seller_phone,
                  (select businesses.phone from businesses where businesses.id = invoices.business_id)
                ),
                invoice_footer = coalesce(
                  invoice_footer,
                  (select businesses.invoice_footer from businesses where businesses.id = invoices.business_id)
                ),
                customer_phone = coalesce(
                  customer_phone,
                  (select customers.phone from customers where customers.id = invoices.customer_id)
                )
          `.execute(database);
        },
      },
      "202609070001_invoice_billing_names_and_line_details": {
        async up(database) {
          await database.schema
            .alterTable("customers")
            .addColumn("billing_name", "text")
            .execute();
          await database.schema
            .alterTable("invoices")
            .addColumn("customer_billing_name", "text")
            .execute();
          await database.schema
            .alterTable("invoice_lines")
            .addColumn("details", "text")
            .execute();
          await database.schema
            .alterTable("recurring_invoice_lines")
            .addColumn("details", "text")
            .execute();
        },
      },
    };
  },
};

export async function runDatabaseMigrations(database: Kysely<Database>): Promise<void> {
  const authMigrations = await getBetterAuthMigrations(authOptions);
  await authMigrations.runMigrations();

  const migrator = new Migrator({
    db: database,
    provider: domainMigrationProvider,
    migrationTableName: "folio_migrations",
    migrationLockTableName: "folio_migration_lock",
  });
  const { error, results } = await migrator.migrateToLatest();

  if (error) throw error;
  const failed = results?.find((result) => result.status === "Error");
  if (failed) throw new Error(`Database migration ${failed.migrationName} failed.`);
}
