"use client";

import { useRef, useState } from "react";

import {
  validateImageUpload,
  type ImageUploadConfig,
} from "@/lib/image-upload";

export function useImageUploadPreview({
  config,
  initialPreview,
}: {
  config: ImageUploadConfig;
  initialPreview?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(initialPreview ?? null);
  const [message, setMessage] = useState<string>();
  const [removed, setRemoved] = useState(false);

  function chooseFile(file: File | undefined) {
    if (!file) return;

    const error = validateImageUpload(file, config);
    if (error) {
      setMessage(error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setMessage(undefined);
    setRemoved(false);
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => setPreview(typeof reader.result === "string" ? reader.result : null),
      { once: true },
    );
    reader.readAsDataURL(file);
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setRemoved(true);
    setMessage(undefined);
  }

  return {
    chooseFile,
    inputRef,
    message,
    preview,
    remove,
    removed,
  };
}
