import type { Migration } from "kysely/migration";

export const invoiceEditMigration: Migration = {
  async up(database) {
    await database.schema
      .createTable("invoice_revisions")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) => column.notNull().references("businesses.id").onDelete("cascade"))
      .addColumn("invoice_id", "text", (column) => column.notNull().references("invoices.id").onDelete("cascade"))
      .addColumn("actor_name", "text", (column) => column.notNull())
      .addColumn("invoice_number", "text")
      .addColumn("currency", "text", (column) => column.notNull())
      .addColumn("total_cents", "integer", (column) => column.notNull())
      .addColumn("snapshot", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .execute();
    await database.schema.createIndex("invoice_revisions_invoice_index")
      .on("invoice_revisions").columns(["business_id", "invoice_id", "created_at"]).execute();
  },
};
