import { describe, expect, it } from "vitest";

import {
  SearchResultsResponseSchema,
  WorkspaceListResponseSchema,
} from "../src/schemas.js";

describe("WorkspaceListResponseSchema", () => {
  it("rejects malformed workspace list responses", () => {
    expect(WorkspaceListResponseSchema.safeParse({}).success).toBe(false);
    expect(
      WorkspaceListResponseSchema.safeParse({
        workspaces: [{ name: "Missing ID" }],
      }).success,
    ).toBe(false);
  });
});

describe("SearchResultsResponseSchema", () => {
  it("rejects fractional, negative, and zero pagination values", () => {
    const validPage = {
      creators: [],
      total: 1,
      offset: 0,
      limit: 1,
    };

    expect(
      SearchResultsResponseSchema.safeParse({ ...validPage, total: 1.5 })
        .success,
    ).toBe(false);
    expect(
      SearchResultsResponseSchema.safeParse({ ...validPage, offset: -1 })
        .success,
    ).toBe(false);
    expect(
      SearchResultsResponseSchema.safeParse({ ...validPage, limit: 0 }).success,
    ).toBe(false);
  });
});
