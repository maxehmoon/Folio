import { AppShell } from "@/components/folio/app-shell";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireBusiness, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [session, business] = await Promise.all([requireSession(), requireBusiness()]);

  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email }}
      business={{
        name: business.name,
        detail: business.legal_name ?? `${business.currency} invoices`,
        imageUrl: business.logo_url,
      }}
      accountActions={
        <LogoutButton variant="ghost" className="rounded-lg">
          Sign out
        </LogoutButton>
      }
    >
      {children}
    </AppShell>
  );
}
