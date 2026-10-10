import { sql } from "kysely";
import type { Migration } from "kysely/migration";

export const mcpMigration: Migration = {
  async up(database) {
    await database.schema
      .createTable("mcp_access_tokens")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("business_id", "text", (column) =>
        column.notNull().references("businesses.id").onDelete("cascade"),
      )
      .addColumn("label", "text", (column) => column.notNull())
      .addColumn("access", "text", (column) => column.notNull())
      .addColumn("token_hash", "text", (column) => column.notNull().unique())
      .addColumn("token_prefix", "text", (column) => column.notNull())
      .addColumn("created_at", "text", (column) => column.notNull())
      .addColumn("expires_at", "text", (column) => column.notNull())
      .addColumn("revoked_at", "text")
      .addCheckConstraint("mcp_access_valid", sql`access IN ('read', 'write')`)
      .execute();
    await database.schema
      .createIndex("mcp_access_tokens_business_idx")
      .on("mcp_access_tokens")
      .columns(["business_id", "created_at"])
      .execute();
  },
  async down(database) {
    await database.schema.dropTable("mcp_access_tokens").execute();
  },
};
