"use client";

import { ChevronRight, House } from "@/components/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbRegistration = {
  pathname: string;
  items: BreadcrumbItem[];
};

type BreadcrumbContextValue = {
  clear: (pathname: string) => void;
  items: BreadcrumbItem[];
  register: (registration: BreadcrumbRegistration) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

const sectionLabels: Record<string, string> = {
  customers: "Customers",
  expenses: "Expenses",
  invoices: "Invoices",
  items: "Items",
  payments: "Payments",
  recurring: "Recurring",
  reports: "Reports",
  settings: "Settings",
};

function defaultBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const section = pathname.split("/").filter(Boolean)[0];
  return [{ label: section ? sectionLabels[section] ?? "Folio" : "Overview" }];
}

function useBreadcrumbContext() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error("Breadcrumb components must be used within BreadcrumbProvider");
  }
  return context;
}

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [registration, setRegistration] = useState<BreadcrumbRegistration | null>(null);

  const register = useCallback((nextRegistration: BreadcrumbRegistration) => {
    setRegistration(nextRegistration);
  }, []);

  const clear = useCallback((registeredPathname: string) => {
    setRegistration((current) =>
      current?.pathname === registeredPathname ? null : current,
    );
  }, []);

  const items = useMemo(
    () =>
      registration?.pathname === pathname
        ? registration.items
        : defaultBreadcrumbs(pathname),
    [pathname, registration],
  );

  const value = useMemo(
    () => ({ clear, items, register }),
    [clear, items, register],
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function BreadcrumbRegistration({ items }: { items: BreadcrumbItem[] }) {
  const pathname = usePathname();
  const { clear, register } = useBreadcrumbContext();

  useEffect(() => {
    register({ items, pathname });
    return () => clear(pathname);
  }, [clear, items, pathname, register]);

  return null;
}

export function BreadcrumbBar({ className }: { className?: string }) {
  const { items } = useBreadcrumbContext();

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1">
        <li className="flex shrink-0 items-center gap-1">
          <Link
            href="/"
            aria-label="Home"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-[background-color,color] hover:bg-foreground/[0.045] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <House aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          </Link>
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-subtle-foreground"
            strokeWidth={1.75}
          />
        </li>
        {items.map((item, index) => {
          const current = index === items.length - 1;

          return (
            <li className="flex min-w-0 items-center gap-1" key={`${item.href ?? "current"}-${item.label}`}>
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle-foreground"
                  strokeWidth={1.75}
                />
              ) : null}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className="truncate rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={current ? "page" : undefined}
                  className="truncate px-2 py-1.5 text-[13px] font-medium text-foreground"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
