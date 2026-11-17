import { describe, expect, it } from "vitest";

import { SearchCreatorsInputSchema } from "../src/tool-inputs.js";

describe("search_creators Product-Fit and YouTube kinds", () => {
  it("accepts YouTube semantic, Product-Fit and reference searches", () => {
    for (const input of [
      { kind: "semantic", query: "home workout" },
      {
        kind: "semantic",
        product: { image: ["https://example.com/serum.png"] },
      },
      {
        kind: "reference",
        reference: { creator: { platform: "youtube", username: "tryguys" } },
      },
    ]) {
      expect(
        SearchCreatorsInputSchema.safeParse({
          platform: "youtube",
          region: "US",
          ...input,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects a product on a non-semantic search and YouTube metric filters", () => {
    expect(
      SearchCreatorsInputSchema.safeParse({
        kind: "keyword",
        platform: "youtube",
        region: "US",
        query: "serum",
        product: {},
      }).success,
    ).toBe(false);
    expect(
      SearchCreatorsInputSchema.safeParse({
        kind: "semantic",
        platform: "youtube",
        region: "US",
        query: "serum",
        filters: { avg_views: { min: 1000 } },
      }).success,
    ).toBe(false);
  });
});
