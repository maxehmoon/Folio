import { describe, expect, it } from "vitest";

import {
  buildListHref,
  DEFAULT_LIST_PAGE_LIMIT,
  listPageLimitSchema,
} from "./list-pagination";

describe("list pagination", () => {
  it("accepts only the supported page limits", () => {
    expect(listPageLimitSchema.parse("10")).toBe(10);
    expect(listPageLimitSchema.parse("50")).toBe(50);
    expect(listPageLimitSchema.parse("500")).toBe(DEFAULT_LIST_PAGE_LIMIT);
  });

  it("builds a URL from populated query values", () => {
    expect(
      buildListHref("/customers", {
        q: "North & South",
        status: undefined,
        page: 2,
        limit: 50,
      }),
    ).toBe("/customers?q=North+%26+South&page=2&limit=50");
  });

  it("returns the pathname when every query value is empty", () => {
    expect(
      buildListHref("/expenses", {
        category: null,
        page: undefined,
        q: "",
      }),
    ).toBe("/expenses");
  });
});
