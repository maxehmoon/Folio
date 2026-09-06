import { z } from "zod";

export const LIST_PAGE_LIMITS = [10, 25, 50] as const;
export const DEFAULT_LIST_PAGE_LIMIT = LIST_PAGE_LIMITS[1];

const supportedPageLimitSchema = z.union([
  z.literal(LIST_PAGE_LIMITS[0]),
  z.literal(LIST_PAGE_LIMITS[1]),
  z.literal(LIST_PAGE_LIMITS[2]),
]);

export const listPageLimitSchema = z.coerce
  .number()
  .pipe(supportedPageLimitSchema)
  .catch(DEFAULT_LIST_PAGE_LIMIT);

export type ListPageLimit = z.output<typeof listPageLimitSchema>;
export type ListQuery = Record<string, string | number | null | undefined>;

export function buildListHref(pathname: string, query: ListQuery): string {
  const searchParams = new URLSearchParams();

  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(name, String(value));
    }
  }

  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}
