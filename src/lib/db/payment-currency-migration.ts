import { sql } from "kysely";
import type { Migration } from "kysely/migration";

export const paymentCurrencyMigration: Migration = {
  async up(database) {
    await database.schema.alterTable("payments")
      .addColumn("applied_amount_cents", "bigint").execute();
    await database.schema.alterTable("payments")
      .addColumn("base_currency", "text").execute();
    await database.schema.alterTable("payments")
      .addColumn("exchange_rate_micros", "bigint").execute();
    await database.schema.alterTable("payments")
      .addColumn("exchange_rate_date", "text").execute();
    await database.schema.alterTable("payments")
      .addColumn("exchange_rate_source", "text").execute();

    // Receipts retain the exchange-rate snapshot that valued them before their
    // invoice becomes editable. The allocation can change currency independently.
    await sql`
      update payments
      set applied_amount_cents = amount_cents,
          base_currency = (
            select coalesce(invoices.base_currency, invoices.currency)
            from invoices where invoices.id = payments.invoice_id
              and invoices.business_id = payments.business_id
          ),
          exchange_rate_micros = (
            select case when payments.currency = coalesce(invoices.base_currency, invoices.currency)
              then 1000000 when payments.currency = invoices.currency
              then invoices.exchange_rate_micros else null end
            from invoices where invoices.id = payments.invoice_id
              and invoices.business_id = payments.business_id
          ),
          exchange_rate_date = (
            select invoices.exchange_rate_date from invoices
            where invoices.id = payments.invoice_id and invoices.business_id = payments.business_id
          ),
          exchange_rate_source = (
            select invoices.exchange_rate_source from invoices
            where invoices.id = payments.invoice_id and invoices.business_id = payments.business_id
          )
    `.execute(database);
  },
};
