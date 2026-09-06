import Image from "next/image";

import { cn } from "@/lib/utils";

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function CustomerAvatar({
  className,
  imageUrl,
  name,
}: {
  className?: string;
  imageUrl?: string | null;
  name: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[12px] font-medium text-muted-foreground",
        className,
      )}
    >
      {imageUrl ? (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="64px"
          src={imageUrl}
          unoptimized
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
