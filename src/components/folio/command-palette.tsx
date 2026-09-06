"use client";

import type { LucideIcon } from "@/components/ui/icons";
import {
  ChartNoAxesCombined,
  CircleDollarSign,
  FileClock,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Package,
  Receipt,
  Settings,
  UserPlus,
  Users,
} from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type {
  FolioSearchGroup,
  FolioSearchResponse,
  FolioSearchResultType,
} from "@/features/search/types";

type PaletteCommand = {
  description: string;
  href: string;
  icon: LucideIcon;
  id: string;
  keywords: string;
  label: string;
};

type PaletteCommandGroup = {
  commands: readonly PaletteCommand[];
  name: "Create" | "Navigate" | "Invoice views";
};

type FolioCommandPaletteProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const commandGroups = [
  {
    name: "Create",
    commands: [
      {
        id: "create-invoice",
        label: "Create invoice",
        description: "Start a new draft invoice",
        href: "/invoices/new",
        icon: FilePlus2,
        keywords: "new bill customer sale",
      },
      {
        id: "create-recurring",
        label: "Create recurring invoice",
        description: "Set up an automatic invoice schedule",
        href: "/recurring/new",
        icon: FileClock,
        keywords: "new repeat subscription schedule",
      },
      {
        id: "create-customer",
        label: "Add customer",
        description: "Create a customer profile",
        href: "/customers/new",
        icon: UserPlus,
        keywords: "new client contact",
      },
      {
        id: "create-item",
        label: "Add item",
        description: "Create a reusable invoice line",
        href: "/items/new",
        icon: Package,
        keywords: "new service product rate",
      },
      {
        id: "record-payment",
        label: "Record payment",
        description: "Record money received against an invoice",
        href: "/payments?record=1",
        icon: CircleDollarSign,
        keywords: "new receipt paid money",
      },
      {
        id: "create-expense",
        label: "Add expense",
        description: "Record a business cost",
        href: "/expenses/new",
        icon: Receipt,
        keywords: "new cost purchase receipt",
      },
    ],
  },
  {
    name: "Navigate",
    commands: [
      {
        id: "dashboard",
        label: "Dashboard",
        description: "Open the dashboard",
        href: "/",
        icon: LayoutDashboard,
        keywords: "home overview stats",
      },
      {
        id: "invoices",
        label: "Invoices",
        description: "Open all invoices",
        href: "/invoices",
        icon: FileText,
        keywords: "bills sales",
      },
      {
        id: "recurring",
        label: "Recurring invoices",
        description: "Open invoice schedules",
        href: "/recurring",
        icon: FileClock,
        keywords: "repeat subscription schedules",
      },
      {
        id: "customers",
        label: "Customers",
        description: "Open customer profiles",
        href: "/customers",
        icon: Users,
        keywords: "clients contacts",
      },
      {
        id: "items",
        label: "Items",
        description: "Open saved invoice lines",
        href: "/items",
        icon: Package,
        keywords: "services products rates",
      },
      {
        id: "payments",
        label: "Payments",
        description: "Open the payment ledger",
        href: "/payments",
        icon: CircleDollarSign,
        keywords: "receipts paid money",
      },
      {
        id: "expenses",
        label: "Expenses",
        description: "Open recorded expenses",
        href: "/expenses",
        icon: Receipt,
        keywords: "costs purchases receipts",
      },
      {
        id: "reports",
        label: "Reports",
        description: "Open sales, receipts and expense reports",
        href: "/reports",
        icon: ChartNoAxesCombined,
        keywords: "sales cashflow income export",
      },
      {
        id: "settings",
        label: "Settings",
        description: "Edit business and invoice defaults",
        href: "/settings",
        icon: Settings,
        keywords: "business account profile defaults",
      },
    ],
  },
  {
    name: "Invoice views",
    commands: [
      {
        id: "overdue-invoices",
        label: "Overdue invoices",
        description: "Invoices past their due date",
        href: "/invoices?status=overdue",
        icon: FileText,
        keywords: "late unpaid due collections",
      },
      {
        id: "outstanding-invoices",
        label: "Outstanding invoices",
        description: "Invoices still waiting for payment",
        href: "/invoices?status=outstanding",
        icon: FileText,
        keywords: "unpaid due collections",
      },
      {
        id: "draft-invoices",
        label: "Draft invoices",
        description: "Invoices that have not been issued",
        href: "/invoices?status=draft",
        icon: FileText,
        keywords: "unissued incomplete",
      },
      {
        id: "paid-invoices",
        label: "Paid invoices",
        description: "Fully settled invoices",
        href: "/invoices?status=paid",
        icon: FileText,
        keywords: "settled complete receipts",
      },
    ],
  },
] satisfies readonly PaletteCommandGroup[];

const commands = commandGroups.flatMap((group) => group.commands);

const resultIcons: Record<FolioSearchResultType, LucideIcon> = {
  customer: Users,
  invoice: FileText,
  recurring: FileClock,
  item: Package,
  payment: CircleDollarSign,
  expense: Receipt,
};

function matchesCommand(command: PaletteCommand, query: string): boolean {
  const haystack = `${command.label} ${command.description} ${command.keywords}`
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

type RemoteSearchState =
  | { status: "idle" | "loading" | "error" }
  | { groups: FolioSearchGroup[]; status: "success" };

type PaletteState = {
  query: string;
  remoteSearch: RemoteSearchState;
  selectedValue: string;
};

const initialPaletteState: PaletteState = {
  query: "",
  remoteSearch: { status: "idle" },
  selectedValue: "command:create-invoice",
};

function firstMatchingCommandValue(query: string) {
  const command = commands.find((candidate) =>
    matchesCommand(candidate, query)
  );
  return command ? `command:${command.id}` : "";
}

export function FolioCommandPalette({
  onOpenChange,
  open,
}: FolioCommandPaletteProps) {
  const router = useRouter();
  const [palette, setPalette] = useState(initialPaletteState);
  const { query, remoteSearch, selectedValue } = palette;
  const trimmedQuery = query.trim();

  const visibleCommandGroups = trimmedQuery
    ? commandGroups
    : commandGroups.slice(0, 1);
  const matchingCommandGroups = visibleCommandGroups.flatMap((group) => {
    const groupCommands = trimmedQuery
      ? group.commands.filter((command) =>
        matchesCommand(command, trimmedQuery)
      )
      : group.commands;
    return groupCommands.length > 0
      ? [{ groupCommands, groupName: group.name }]
      : [];
  });
  const matchingCommands = matchingCommandGroups.flatMap(
    (group) => group.groupCommands,
  );

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPalette((current) =>
        current.query.trim() === trimmedQuery
          ? { ...current, remoteSearch: { status: "loading" } }
          : current
      );
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}`,
          {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Search request failed");
        const result = (await response.json()) as FolioSearchResponse;
        const firstResult = result.groups[0]?.results[0];
        setPalette((current) => {
          if (current.query.trim() !== trimmedQuery) return current;
          return {
            ...current,
            remoteSearch: { groups: result.groups, status: "success" },
            selectedValue: current.selectedValue ||
              (firstResult
                ? `result:${firstResult.type}:${firstResult.id}`
                : ""),
          };
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPalette((current) =>
          current.query.trim() === trimmedQuery
            ? { ...current, remoteSearch: { status: "error" } }
            : current
        );
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, trimmedQuery]);

  function navigate(href: string) {
    router.push(href);
    onOpenChange(false);
    setPalette(initialPaletteState);
  }

  function changeOpen(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setPalette(initialPaletteState);
    }
  }

  function changeQuery(nextQuery: string) {
    setPalette({
      query: nextQuery,
      remoteSearch: { status: "idle" },
      selectedValue: firstMatchingCommandValue(nextQuery.trim()),
    });
  }

  const visibleGroups =
    trimmedQuery.length >= 2 && remoteSearch.status === "success"
      ? remoteSearch.groups
      : [];
  const hasResults = matchingCommands.length > 0 || visibleGroups.length > 0;
  const visibleStatus = trimmedQuery.length >= 2 ? remoteSearch.status : "idle";

  return (
    <CommandDialog onOpenChange={changeOpen} open={open}>
      <Command
        onValueChange={(nextValue) =>
          setPalette((current) => ({
            ...current,
            selectedValue: nextValue,
          }))}
        shouldFilter={false}
        value={selectedValue}
      >
        <CommandInput
          autoFocus
          onValueChange={changeQuery}
          placeholder="Search Folio or run a command…"
          value={query}
        />
        <CommandList>
          {matchingCommandGroups.map(
            ({ groupCommands, groupName }, groupIndex) => {
              return (
                <div key={groupName}>
                  {groupIndex > 0 ? <CommandSeparator /> : null}
                  <CommandGroup heading={groupName}>
                    {groupCommands.map((command) => {
                      const Icon = command.icon;
                      return (
                        <CommandItem
                          key={command.id}
                          onSelect={() => navigate(command.href)}
                          value={`command:${command.id}`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-[10px] bg-muted/70 text-muted-foreground">
                            <Icon aria-hidden="true" className="size-[14px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">
                              {command.label}
                            </span>
                            {trimmedQuery
                              ? (
                                <span className="mt-0.5 block truncate text-[12px] text-subtle-foreground">
                                  {command.description}
                                </span>
                              )
                              : null}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </div>
              );
            },
          )}

          {visibleGroups.map((group, index) => (
            <div key={group.key}>
              {matchingCommands.length > 0 || index > 0
                ? <CommandSeparator />
                : null}
              <CommandGroup heading={group.label}>
                {group.results.map((result) => {
                  const Icon = resultIcons[result.type];
                  return (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      onSelect={() => navigate(result.href)}
                      value={`result:${result.type}:${result.id}`}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-[10px] bg-muted/70 text-muted-foreground">
                        <Icon aria-hidden="true" className="size-[14px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">
                            {result.title}
                          </span>
                          {result.badge
                            ? (
                              <span className="shrink-0 rounded-full bg-foreground/[0.045] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {result.badge}
                              </span>
                            )
                            : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-subtle-foreground">
                          {result.description}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}

          {visibleStatus === "loading"
            ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-[12px] text-subtle-foreground">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-3.5 animate-spin"
                />
                Searching Folio…
              </div>
            )
            : null}
          {visibleStatus === "error"
            ? (
              <div className="px-4 py-8 text-center text-[12px] text-destructive">
                Search is temporarily unavailable. Try again.
              </div>
            )
            : null}
          {trimmedQuery.length >= 2 && visibleStatus === "success" &&
              !hasResults
            ? <CommandEmpty>No matching records or commands.</CommandEmpty>
            : null}
          {trimmedQuery.length === 1 && matchingCommands.length === 0
            ? (
              <CommandEmpty>
                Type one more character to search your records.
              </CommandEmpty>
            )
            : null}
        </CommandList>
        <div className="flex items-center justify-end gap-3 px-4 pb-3 pt-1 text-[10px] text-subtle-foreground">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
