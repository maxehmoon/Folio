import { describe, expect, it } from "vitest";

import { likeContainsPattern } from "./like";

describe("likeContainsPattern", () => {
  it("wraps a value for a contains search", () => {
    expect(likeContainsPattern("Northstar")).toBe("%Northstar%");
  });

  it("escapes LIKE wildcards and the escape character", () => {
    expect(likeContainsPattern("50%_! off")).toBe("%50!%!_!! off%");
  });
});
