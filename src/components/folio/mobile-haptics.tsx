"use client";

import { useEffect } from "react";
import { useWebHaptics } from "web-haptics/react";

type HapticPreset =
  | "light"
  | "medium"
  | "selection"
  | "success"
  | "warning";

function feedbackForTarget(target: HTMLElement): HapticPreset | null {
  if (target.closest(":disabled, [aria-disabled='true']")) return null;

  const explicitTarget = target.closest<HTMLElement>("[data-haptic]");
  const explicit = explicitTarget?.dataset.haptic;
  if (explicit === "none") return null;
  if (
    explicit === "light" ||
    explicit === "medium" ||
    explicit === "selection" ||
    explicit === "success" ||
    explicit === "warning"
  ) {
    return explicit;
  }

  const button = target.closest<HTMLElement>("[data-slot='button']");
  if (button) {
    if (button.dataset.variant === "destructive") return "warning";
    if (button.dataset.variant === "default") return "medium";
  }

  if (
    target.closest(
      "[role='menuitem'], [role='menuitemradio'], [role='option'], [data-slot='checkbox']",
    )
  ) {
    return "selection";
  }

  return null;
}

export function MobileHaptics() {
  const { trigger } = useWebHaptics();

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof HTMLElement)) return;
      const feedback = feedbackForTarget(event.target);
      if (feedback) void trigger(feedback);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [trigger]);

  return null;
}
