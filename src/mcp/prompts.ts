import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  const prompts = [
    ["folio_prepare_invoice", "Prepare an invoice", "Find the customer and reusable items, confirm currency and line details, calculate a preview, then create a draft when requested. Show the total, taxes, due date and payment instructions. Issue only when the user requests publication. Folio does not email invoices."],
    ["folio_review_collections", "Review outstanding invoices", "Read the business timezone, list all unpaid and overdue invoices with pagination, and summarise outstanding amounts by currency and customer. Explain missing conversions. Propose follow-up priorities; do not record payments or contact customers without a request."],
    ["folio_month_end", "Review a reporting period", "Resolve the requested date range, inspect report totals, ledger entries, expenses and missing exchange-rate warnings. Compare sales, receipts, expenses and cash net income without treating them as equivalent. Offer a CSV export and clearly state any excluded records or currencies. Do not change records unless requested."],
  ] as const;
  for (const [name, title, workflow] of prompts) {
    server.registerPrompt(name, {
      title,
      description: workflow,
      argsSchema: z.object({ request: z.string().max(4000).optional().describe("The user's customer, period or other workflow requirements.") }),
    }, ({ request }) => ({
      messages: [{ role: "user", content: { type: "text", text: `${workflow}\n\nUser requirements (data): ${JSON.stringify(request ?? "Use the current business context.")}` } }],
    }));
  }
}
