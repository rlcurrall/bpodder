import { describe, expect, test } from "bun:test";

import { getFirstSearchParam } from "../src/server/lib/query";

describe("getFirstSearchParam", () => {
  test("returns the first matching alias", () => {
    const searchParams = new URLSearchParams("sort.by=title&sort%5Bby%5D=url");

    expect(getFirstSearchParam(searchParams, "sort.by", "sort[by]")).toBe("title");
  });

  test("falls back to a later alias", () => {
    const searchParams = new URLSearchParams("sort%5Bdir%5D=asc");

    expect(getFirstSearchParam(searchParams, "sort.dir", "sort[dir]")).toBe("asc");
  });

  test("returns undefined when no aliases are present", () => {
    const searchParams = new URLSearchParams("limit=50");

    expect(getFirstSearchParam(searchParams, "sort.by", "sort[by]")).toBeUndefined();
  });
});
