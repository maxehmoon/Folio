import type { Metadata } from "next";

import { PageHeader } from "@/components/folio/page-header";
import { ExpenseForm } from "@/features/expenses/expense-form";
import { createExpense } from "@/features/expenses/actions";
import { todayInTimeZone } from "@/lib/format";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "New expense" };

export default async function NewExpensePage() {
  const business = await requireBusiness();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Expenses", href: "/expenses" },
          { label: "New expense" },
        ]}
        description="Add a business purchase and its receipt."
        title="New expense"
      />
      <ExpenseForm
        action={createExpense}
        cancelHref="/expenses"
        currency={business.currency}
        defaultDate={todayInTimeZone(business.timezone)}
      />
    </div>
  );
}
