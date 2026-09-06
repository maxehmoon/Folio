import Image from "next/image";

import { cn } from "@/lib/utils";
import { FolioMark } from "./folio-mark";

export function BusinessAvatar({
  className,
  imageUrl,
}: {
  className?: string;
  imageUrl?: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-[12px] font-medium text-primary-foreground",
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
        <FolioMark className="h-[58%] w-auto" />
      )}
    </span>
  );
}
