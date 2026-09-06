import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/folio/page-header";
import { updateExpense } from "@/features/expenses/actions";
import { ExpenseForm } from "@/features/expenses/expense-form";
import { getExpense } from "@/features/expenses/queries";
import { todayInTimeZone } from "@/lib/format";
import { expenseIdSchema } from "@/features/expenses/schema";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Edit expense" };

type EditExpensePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const [{ id: rawId }, business] = await Promise.all([params, requireBusiness()]);
  const id = expenseIdSchema.safeParse(rawId);
  if (!id.success) notFound();

  const expense = await getExpense(id.data);
  if (!expense) notFound();

  const action = updateExpense.bind(null, expense.id);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Expenses", href: "/expenses" },
          {
            label: expense.vendor,
            href: `/expenses/${expense.id}`,
          },
          { label: "Edit" },
        ]}
        description="Change the purchase, tax or receipt details."
        title={`Edit ${expense.vendor}`}
      />
      <ExpenseForm
        action={action}
        cancelHref={`/expenses/${expense.id}`}
        currency={business.currency}
        defaultDate={todayInTimeZone(business.timezone)}
        expense={expense}
      />
    </div>
  );
}
