"use client";

import {
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type SlidingTabBarProps = {
  "aria-label": string;
  children: ReactNode;
  className?: string;
};

type Highlight = {
  animate: boolean;
  height: number;
  visible: boolean;
  width: number;
  x: number;
  y: number;
};

const hiddenHighlight: Highlight = {
  animate: false,
  height: 0,
  visible: false,
  width: 0,
  x: 0,
  y: 0,
};

function SlidingTabBar({
  "aria-label": ariaLabel,
  children,
  className,
  orientation,
}: SlidingTabBarProps & {
  orientation: "horizontal" | "vertical";
}) {
  const containerRef = useRef<HTMLElement>(null);
  const hasShownHighlightRef = useRef(false);
  const [highlight, setHighlight] = useState(hiddenHighlight);

  function showHighlight(target: HTMLElement) {
    const container = containerRef.current;
    if (!container || !container.contains(target)) return;

    const containerBounds = container.getBoundingClientRect();
    const labelBounds = getLabelBounds(target, orientation === "horizontal");
    const horizontalPadding = orientation === "horizontal" ? 10 : 0;
    const verticalPadding = orientation === "horizontal" ? 7 : 0;
    const width = labelBounds.width + horizontalPadding * 2;
    const height = labelBounds.height + verticalPadding * 2;
    const animate = hasShownHighlightRef.current;
    hasShownHighlightRef.current = true;

    setHighlight({
      animate,
      height,
      visible: true,
      width,
      x:
        labelBounds.left -
        containerBounds.left +
        container.scrollLeft +
        labelBounds.width / 2,
      y:
        labelBounds.top -
        containerBounds.top +
        container.scrollTop +
        labelBounds.height / 2,
    });
  }

  function getLabelBounds(target: HTMLElement, padded: boolean) {
    if (!padded) return target.getBoundingClientRect();

    const range = document.createRange();
    range.selectNodeContents(target);
    const bounds = range.getBoundingClientRect();

    return bounds.width > 0 && bounds.height > 0
      ? bounds
      : target.getBoundingClientRect();
  }

  function findTab(target: EventTarget | null) {
    return target instanceof Element
      ? target.closest<HTMLElement>("[data-sliding-tab]")
      : null;
  }

  function handlePointerOver(event: PointerEvent<HTMLElement>) {
    const tab = findTab(event.target);
    if (tab) showHighlight(tab);
  }

  function handleFocus(event: FocusEvent<HTMLElement>) {
    const tab = findTab(event.target);
    if (tab) showHighlight(tab);
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setHighlight((current) => ({ ...current, visible: false }));
    }
  }

  function hideHighlight() {
    setHighlight((current) => ({ ...current, visible: false }));
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("relative", className)}
      data-orientation={orientation}
      onBlurCapture={handleBlur}
      onFocusCapture={handleFocus}
      onPointerLeave={hideHighlight}
      onPointerOver={handlePointerOver}
      ref={containerRef}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-0 rounded-[14px] bg-muted will-change-[transform,width,height,opacity]",
          highlight.animate &&
            "motion-safe:transition-[transform,width,height,opacity] motion-safe:duration-200 motion-safe:ease-out",
          highlight.visible ? "opacity-100" : "opacity-0",
        )}
        style={{
          height: highlight.height,
          transform: `translate3d(${highlight.x}px, ${highlight.y}px, 0) translate(-50%, -50%)`,
          width: highlight.width,
        }}
      />
      {children}
    </nav>
  );
}

export function HorizontalSlidingTabBar(props: SlidingTabBarProps) {
  return (
    <SlidingTabBar
      {...props}
      className={cn(
        "overflow-x-auto overflow-y-clip [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        props.className,
      )}
      orientation="horizontal"
    />
  );
}

export function VerticalSlidingTabBar(props: SlidingTabBarProps) {
  return <SlidingTabBar {...props} orientation="vertical" />;
}
