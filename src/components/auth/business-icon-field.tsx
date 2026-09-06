"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "@/components/ui/icons";

import { BusinessAvatar } from "@/components/folio/business-avatar";
import { Button } from "@/components/ui/button";
import {
  BUSINESS_ICON_ACCEPT,
  businessIconErrorMessage,
  validateBusinessIcon,
} from "@/features/business/icon";

export function BusinessIconField({
  initialImageUrl,
}: {
  initialImageUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(initialImageUrl ?? null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string>();

  function chooseFile(file?: File) {
    if (!file) return;
    const validationError = validateBusinessIcon(file);
    if (validationError) {
      setError(businessIconErrorMessage(validationError));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => {
        setPreview(typeof reader.result === "string" ? reader.result : null);
        setRemoved(false);
        setError(undefined);
      },
      { once: true },
    );
    reader.readAsDataURL(file);
  }

  function removeIcon() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setRemoved(Boolean(initialImageUrl));
    setError(undefined);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-subtle p-3.5 sm:flex-row sm:items-center">
      <BusinessAvatar
        className="size-14 rounded-2xl ring-1 ring-foreground/[0.06] dark:ring-0"
        imageUrl={preview}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">
          Organisation icon
        </p>
        <p className="mt-0.5 text-[12px] leading-4 text-subtle-foreground">
          Optional. PNG, JPEG or WebP up to 512 KB.
        </p>
        {error ? (
          <p className="mt-1.5 text-[12px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <input
        accept={BUSINESS_ICON_ACCEPT}
        className="sr-only"
        id="business-icon"
        name="icon"
        onChange={(event) => chooseFile(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      {removed ? <input name="removeLogo" type="hidden" value="1" /> : null}
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <label className="cursor-pointer" htmlFor="business-icon">
            <ImagePlus aria-hidden="true" />
            {preview ? "Replace" : "Upload"}
          </label>
        </Button>
        {preview ? (
          <Button
            aria-label="Remove organisation icon"
            onClick={removeIcon}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
