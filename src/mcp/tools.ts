import { registerCatalogueTools } from "./catalogue";
import { registerExpenseTools } from "./expenses";
import { registerInvoiceTools } from "./invoices";
import { registerPaymentTools } from "./payments";
import { registerRecurringTools } from "./recurring";
import { registerReportingTools } from "./reporting";
import type { McpContext, ToolRegistrar } from "./types";

/** Register the same validated business operations for both public transports. */
export function registerFolioTools(register: ToolRegistrar, context: McpContext) {
  registerCatalogueTools(register, context);
  registerExpenseTools(register, context);
  registerInvoiceTools(register, context);
  registerPaymentTools(register, context);
  registerRecurringTools(register, context);
  registerReportingTools(register, context);
}
