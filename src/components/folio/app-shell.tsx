"use client";

import {
  ChartNoAxesCombined,
  Monitor,
  Package,
} from "@/components/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
  type FocusEvent,
  type PointerEvent,
  type RefAttributes,
  type ReactNode,
} from "react";

import { Cancel01Icon } from "@/components/ui/cancel-01";
import { Clock01Icon } from "@/components/ui/clock-01";
import { CreditCardIcon } from "@/components/ui/credit-card";
import { DashboardSquare01Icon } from "@/components/ui/dashboard-square-01";
import { File01Icon } from "@/components/ui/file-01";
import { Menu01Icon } from "@/components/ui/menu-01";
import { Moon02Icon } from "@/components/ui/moon-02";
import { Search01Icon } from "@/components/ui/search-01";
import { Settings01Icon } from "@/components/ui/settings-01";
import { Sun03Icon } from "@/components/ui/sun-03";
import { UserMultiple02Icon } from "@/components/ui/user-multiple-02";
import { Wallet01Icon } from "@/components/ui/wallet-01";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useTheme,
  type ThemePreference,
} from "@/components/folio/theme-provider";
import { BusinessAvatar } from "@/components/folio/business-avatar";
import type { AnimatedIconHandle } from "@/lib/use-icon-animation";
import { cn } from "@/lib/utils";

import {
  BreadcrumbBar,
  BreadcrumbProvider,
} from "./breadcrumbs";
import { FolioCommandPalette } from "./command-palette";

const MobileHaptics = lazy(() =>
  import("./mobile-haptics").then((module) => ({
    default: module.MobileHaptics,
  })),
);

function subscribeToCoarsePointer(onChange: () => void) {
  const media = window.matchMedia("(pointer: coarse)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getCoarsePointerSnapshot() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function getServerCoarsePointerSnapshot() {
  return false;
}

export type FolioShellUser = {
  name: string;
  email?: string;
  initials?: string;
};

export type FolioShellBusiness = {
  name: string;
  detail?: string;
  imageUrl?: string | null;
};

export type AppShellProps = {
  children?: ReactNode;
  user?: FolioShellUser;
  business?: FolioShellBusiness;
  accountActions?: ReactNode;
};

type NavigationIconProps = {
  "aria-hidden"?: boolean | "false" | "true";
  className?: string;
  size?: number;
};

type NavigationIcon = ComponentType<NavigationIconProps>;
type AnimatedNavigationIcon = ComponentType<
  NavigationIconProps & RefAttributes<AnimatedIconHandle>
>;

type NavigationItem = {
  label: string;
  href: string;
} & (
  | { animated: true; icon: AnimatedNavigationIcon }
  | { animated: false; icon: NavigationIcon }
);

const DEFAULT_USER: FolioShellUser = {
  name: "Sole trader",
};

const DEFAULT_BUSINESS: FolioShellBusiness = {
  name: "Folio",
  detail: "Your business",
};

const folioNavigationGroups = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/", icon: DashboardSquare01Icon, animated: true },
      { label: "Invoices", href: "/invoices", icon: File01Icon, animated: true },
      { label: "Recurring", href: "/recurring", icon: Clock01Icon, animated: true },
      { label: "Customers", href: "/customers", icon: UserMultiple02Icon, animated: true },
      { label: "Items", href: "/items", icon: Package, animated: false },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", href: "/payments", icon: CreditCardIcon, animated: true },
      { label: "Expenses", href: "/expenses", icon: Wallet01Icon, animated: true },
      { label: "Reports", href: "/reports", icon: ChartNoAxesCombined, animated: false },
    ],
  },
] satisfies readonly { label: string; items: readonly NavigationItem[] }[];

function getInitials(name: string, suppliedInitials?: string) {
  if (suppliedInitials?.trim()) {
    return suppliedInitials.trim().slice(0, 2).toUpperCase();
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function isActiveRoute(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

type BrandProps = Omit<ComponentProps<typeof Link>, "href"> & {
  business: FolioShellBusiness;
};

const Brand = forwardRef<HTMLAnchorElement, BrandProps>(function Brand(
  { business, className, ...props },
  ref,
) {
  return (
    <Link
      aria-label="Go to dashboard"
      data-haptic="selection"
      href="/"
      ref={ref}
      className={cn(
        "group flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-1 py-1 motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out hover:bg-card/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <BusinessAvatar
        className="size-9 rounded-xl border border-foreground/15 bg-card text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:scale-[1.04]"
        imageUrl={business.imageUrl}
      />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-4 text-foreground">
          {business.name}
        </span>
        {business.detail ? (
          <span className="mt-0.5 block truncate text-[12px] leading-4 text-muted-foreground">
            {business.detail}
          </span>
        ) : null}
      </span>
    </Link>
  );
});

function Navigation({
  pathname,
  mobile = false,
}: {
  pathname: string;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label="Primary navigation"
      className="flex flex-col gap-3"
    >
      {folioNavigationGroups.map((group) => (
        <NavigationGroup
          items={group.items}
          key={group.label}
          label={group.label}
          mobile={mobile}
          pathname={pathname}
        />
      ))}
    </nav>
  );
}

type SidebarHighlight = {
  animate: boolean;
  height: number;
  visible: boolean;
  y: number;
};

const hiddenSidebarHighlight: SidebarHighlight = {
  animate: false,
  height: 0,
  visible: false,
  y: 0,
};

function SidebarHoverGroup({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<HTMLElement>(null);
  const hasShownHighlightRef = useRef(false);
  const [highlight, setHighlight] = useState(hiddenSidebarHighlight);

  function showHighlight(target: HTMLElement) {
    const container = containerRef.current;
    if (!container || !container.contains(target)) return;

    const containerBounds = container.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const animate = hasShownHighlightRef.current;
    hasShownHighlightRef.current = true;
    activeTargetRef.current = target;

    setHighlight({
      animate,
      height: targetBounds.height,
      visible: true,
      y:
        targetBounds.top -
        containerBounds.top +
        container.scrollTop +
        targetBounds.height / 2,
    });
  }

  function findTarget(target: EventTarget | null) {
    return target instanceof Element
      ? target.closest<HTMLElement>("[data-sidebar-hover-target]")
      : null;
  }

  function handlePointerOver(event: PointerEvent<HTMLDivElement>) {
    const target = findTarget(event.target);
    if (target && target !== activeTargetRef.current) showHighlight(target);
  }

  function handleFocus(event: FocusEvent<HTMLDivElement>) {
    const target = findTarget(event.target);
    if (target) showHighlight(target);
  }

  function hideHighlight() {
    activeTargetRef.current = null;
    setHighlight((current) => ({ ...current, visible: false }));
  }

  return (
    <div
      className="relative flex flex-col gap-1"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hideHighlight();
      }}
      onFocusCapture={handleFocus}
      onPointerLeave={hideHighlight}
      onPointerOver={handlePointerOver}
      ref={containerRef}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-0 rounded-xl bg-card/70 will-change-[transform,height,opacity]",
          highlight.animate &&
            "motion-safe:transition-[transform,height,opacity] motion-safe:duration-200 motion-safe:ease-out",
          highlight.visible ? "opacity-100" : "opacity-0",
        )}
        style={{
          height: highlight.height,
          transform: `translate3d(0, ${highlight.y}px, 0) translateY(-50%)`,
        }}
      />
      {children}
    </div>
  );
}

function NavigationGroup({
  items,
  label,
  mobile,
  pathname,
}: {
  items: readonly NavigationItem[];
  label: string;
  mobile: boolean;
  pathname: string;
}) {
  return (
    <div className="rounded-2xl bg-foreground/[0.025] p-1">
      <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle-foreground">
        {label}
      </div>
      <SidebarHoverGroup>
        {items.map((item) => {
          const link = (
            <NavigationLink
              active={isActiveRoute(pathname, item.href)}
              item={item}
              mobile={mobile}
            />
          );

          return mobile ? (
            <SheetClose key={item.href} asChild>
              {link}
            </SheetClose>
          ) : (
            <div className="relative z-10" key={item.href}>
              {link}
            </div>
          );
        })}
      </SidebarHoverGroup>
    </div>
  );
}

function NavigationLink({
  active,
  item,
  mobile,
}: {
  active: boolean;
  item: NavigationItem;
  mobile: boolean;
}) {
  const animatedIconRef = useRef<AnimatedIconHandle>(null);

  function startIconAnimation() {
    animatedIconRef.current?.startAnimation();
  }

  function stopIconAnimation() {
    animatedIconRef.current?.stopAnimation();
  }

  const iconClassName =
    "size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-95 [&_svg]:size-full";

  function renderIcon() {
    if (item.animated) {
      const Icon = item.icon;
      return (
        <Icon
          ref={animatedIconRef}
          aria-hidden="true"
          className={iconClassName}
          size={14}
        />
      );
    }

    const Icon = item.icon;
    return <Icon aria-hidden="true" className={iconClassName} size={14} />;
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-haptic="selection"
      data-sidebar-hover-target
      className={cn(
        "group relative z-10 flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-[transform,color] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.98]",
        mobile && "min-h-11",
        active && "bg-card text-foreground",
      )}
      onBlur={stopIconAnimation}
      onFocus={startIconAnimation}
      onPointerDown={startIconAnimation}
      onPointerEnter={startIconAnimation}
      onPointerLeave={stopIconAnimation}
    >
      {renderIcon()}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

const themeOptions = [
  { label: "Light", value: "light", icon: Sun03Icon },
  { label: "Dark", value: "dark", icon: Moon02Icon },
  { label: "System", value: "system", icon: Monitor },
] satisfies readonly {
  icon: NavigationIcon
  label: string
  value: ThemePreference
}[]

function ThemeMenu({
  mobile,
}: {
  mobile: boolean
}) {
  const { preference, resolvedTheme, setPreference } = useTheme()
  const themeIconRef = useRef<AnimatedIconHandle>(null)
  const ThemeIcon = resolvedTheme === "dark" ? Moon02Icon : Sun03Icon
  const selectedLabel =
    themeOptions.find((option) => option.value === preference)?.label ??
    "Light"

  function startIconAnimation() {
    themeIconRef.current?.startAnimation()
  }

  function stopIconAnimation() {
    themeIconRef.current?.stopAnimation()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Theme: ${selectedLabel}`}
          data-haptic="selection"
          data-sidebar-hover-target
          className={cn(
            "group relative z-10 flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-[transform,color] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.98]",
            mobile && "min-h-11",
          )}
          onBlur={stopIconAnimation}
          onFocus={startIconAnimation}
          onPointerDown={startIconAnimation}
          onPointerEnter={startIconAnimation}
          onPointerLeave={stopIconAnimation}
          type="button"
        >
          <ThemeIcon
            ref={themeIconRef}
            aria-hidden="true"
            className="size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-95 [&_svg]:size-full"
            size={14}
          />
          <span>Appearance</span>
          <span className="ml-auto text-[11px] font-normal text-subtle-foreground">
            {selectedLabel}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        side="top"
        sideOffset={8}
      >
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) =>
            setPreference(value as ThemePreference)
          }
          value={preference}
        >
          {themeOptions.map((option) => {
            const Icon = option.icon
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
              >
                <Icon aria-hidden="true" size={16} />
                {option.label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountSection({
  accountActions,
  user,
  pathname,
  mobile = false,
}: {
  accountActions?: ReactNode;
  user: FolioShellUser;
  pathname: string;
  mobile?: boolean;
}) {
  const active = isActiveRoute(pathname, "/settings");
  const settingsIconRef = useRef<AnimatedIconHandle>(null);

  function startSettingsAnimation() {
    settingsIconRef.current?.startAnimation();
  }

  function stopSettingsAnimation() {
    settingsIconRef.current?.stopAnimation();
  }

  const settingsLink = (
    <Link
      href="/settings"
      aria-current={active ? "page" : undefined}
      data-haptic="selection"
      data-sidebar-hover-target
      className={cn(
        "group relative z-10 flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-[transform,color] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.98]",
        mobile && "min-h-11",
        active && "bg-card",
      )}
      onBlur={stopSettingsAnimation}
      onFocus={startSettingsAnimation}
      onPointerDown={startSettingsAnimation}
      onPointerEnter={startSettingsAnimation}
      onPointerLeave={stopSettingsAnimation}
    >
      <Settings01Icon
        ref={settingsIconRef}
        aria-hidden="true"
        className="size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-95 [&_svg]:size-full"
        size={14}
      />
      <span>Settings</span>
    </Link>
  );

  return (
    <>
      <div className="flex min-h-12 min-w-0 items-center gap-2.5 p-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-sidebar-border bg-card text-[12px] font-medium text-foreground">
          {getInitials(user.name, user.initials)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-4 text-foreground">
            {user.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] leading-4 text-subtle-foreground">
            {user.email ?? "Account settings"}
          </span>
        </span>
      </div>
      <SidebarHoverGroup>
        {mobile ? (
          <SheetClose asChild>{settingsLink}</SheetClose>
        ) : (
          settingsLink
        )}
        <ThemeMenu mobile={mobile} />
        {accountActions ? (
          <div
            data-sidebar-hover-target
            className={cn(
              "relative z-10 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.98] [&_[data-slot=button]]:min-h-10 [&_[data-slot=button]]:w-full [&_[data-slot=button]]:justify-start [&_[data-slot=button]]:gap-2.5 [&_[data-slot=button]]:rounded-xl [&_[data-slot=button]]:px-3 [&_[data-slot=button]]:text-[13px] [&_[data-slot=button]]:hover:bg-transparent [&_[data-slot=button]_svg]:size-3.5 [&_[data-slot=button]_svg]:text-destructive",
              mobile && "[&_[data-slot=button]]:min-h-11",
            )}
          >
            {accountActions}
          </div>
        ) : null}
      </SidebarHoverGroup>
    </>
  );
}

function SidebarContent({
  business,
  user,
  pathname,
  accountActions,
  mobile = false,
}: {
  business: FolioShellBusiness;
  user: FolioShellUser;
  pathname: string;
  accountActions?: ReactNode;
  mobile?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mobile ? (
        <SheetClose asChild>
          <Brand business={business} className="pr-12" />
        </SheetClose>
      ) : (
        <Brand business={business} />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pt-7">
        <Navigation pathname={pathname} mobile={mobile} />
      </div>
      <div className="mt-3 rounded-2xl bg-foreground/[0.025] p-1">
        <AccountSection
          accountActions={accountActions}
          user={user}
          pathname={pathname}
          mobile={mobile}
        />
      </div>
    </div>
  );
}

function NavigationConnectionCurve() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-5 left-0 size-5"
      focusable="false"
      viewBox="0 0 20 20"
    >
      <path
        d="M0 0H20A20 20 0 0 0 0 20Z"
        fill="var(--sidebar)"
      />
    </svg>
  );
}

export function AppShell({
  ...props
}: AppShellProps) {
  return (
    <BreadcrumbProvider>
      <AppShellFrame {...props} />
    </BreadcrumbProvider>
  );
}

function AppShellFrame({
  children,
  user = DEFAULT_USER,
  business = DEFAULT_BUSINESS,
  accountActions,
}: AppShellProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const hapticsEnabled = useSyncExternalStore(
    subscribeToCoarsePointer,
    getCoarsePointerSnapshot,
    getServerCoarsePointerSnapshot,
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      setCommandOpen((current) => !current);
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="min-h-svh bg-background text-foreground">
      {hapticsEnabled ? (
        <Suspense fallback={null}>
          <MobileHaptics />
        </Suspense>
      ) : null}
      <a
        href="#folio-main"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-transform focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        Skip to content
      </a>

      <div className="sticky top-0 z-30 rounded-b-[20px] border-b border-sidebar-border bg-sidebar shadow-[0_1px_2px_rgba(0,0,0,0.035)] lg:hidden">
        <header className="flex h-14 items-center justify-between px-3">
          <Brand business={business} />
          <div className="flex items-center gap-1">
            <button
              aria-keyshortcuts="Meta+K Control+K"
              aria-label="Search Folio"
              data-haptic="selection"
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-[background-color,color] hover:bg-card/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <Search01Icon aria-hidden="true" size={14} />
            </button>
            <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                data-haptic="selection"
                className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-[background-color,color] hover:bg-card/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5"
              >
                <Menu01Icon aria-hidden="true" size={14} />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-[min(20rem,calc(100vw-2rem))] overscroll-contain rounded-r-[22px] border-sidebar-border bg-sidebar p-3 shadow-xl"
            >
              <SheetTitle className="sr-only">Folio navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Main navigation and account settings.
              </SheetDescription>
              <SheetClose asChild>
                <button
                  type="button"
                  aria-label="Close navigation"
                  data-haptic="selection"
                  className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-xl text-muted-foreground transition-[background-color,color] hover:bg-card/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5"
                >
                  <Cancel01Icon aria-hidden="true" size={14} />
                </button>
              </SheetClose>
              <SidebarContent
                business={business}
                user={user}
                pathname={pathname}
                accountActions={accountActions}
                mobile
              />
            </SheetContent>
            </Sheet>
          </div>
        </header>
        <div className="flex h-10 items-center border-t border-sidebar-border/70 px-3">
          <BreadcrumbBar />
        </div>
      </div>

      <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-[236px] rounded-br-[22px] border-b border-sidebar-border bg-sidebar p-3 shadow-[0_1px_2px_rgba(0,0,0,0.025)] lg:flex">
        <SidebarContent
          business={business}
          user={user}
          pathname={pathname}
          accountActions={accountActions}
        />
      </aside>

      <div className="fixed left-[236px] right-0 top-0 z-30 hidden h-14 items-center rounded-br-[22px] border-r border-sidebar-border bg-sidebar px-4 lg:flex">
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-px -translate-y-1/2 bg-sidebar-border"
        />
        <BreadcrumbBar className="flex-1" />
        <div className="ml-4">
          <button
            aria-keyshortcuts="Meta+K Control+K"
            data-haptic="selection"
            className="flex h-9 w-64 shrink-0 items-center gap-2 rounded-xl bg-foreground/[0.025] px-3 text-left text-[12px] text-subtle-foreground ring-1 ring-foreground/[0.045] transition-[background-color,color,box-shadow] hover:bg-card/70 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => setCommandOpen(true)}
            type="button"
          >
            <Search01Icon
              aria-hidden="true"
              className="size-3.5 shrink-0 [&_svg]:size-full"
              size={14}
            />
            <span className="min-w-0 flex-1 truncate">Search Folio…</span>
            <kbd className="rounded-full border border-foreground/[0.07] bg-card/70 px-2 py-0.5 text-[10px] text-subtle-foreground">
              ⌘ K
            </kbd>
          </button>
        </div>
        <NavigationConnectionCurve />
      </div>

      <main
        id="folio-main"
        tabIndex={-1}
        className="min-w-0 lg:pl-[236px] lg:pt-14"
      >
        <div className="mx-auto min-h-[calc(100svh-6rem)] w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-7 lg:min-h-[calc(100svh-3.5rem)] lg:px-8 lg:py-7">
          {children}
        </div>
      </main>

      {commandOpen ? (
        <FolioCommandPalette onOpenChange={setCommandOpen} open />
      ) : null}
    </div>
  );
}
