import { describe, expect, it } from "vitest";

import { SearchCreatorsInputSchema } from "../src/tool-inputs.js";

describe("recent-post tag search input", () => {
  it("applies the count limit after normalization and deduplication", () => {
    const parsed = SearchCreatorsInputSchema.parse({
      kind: "semantic",
      platform: "tiktok",
      region: "US",
      query: "beauty",
      filters: {
        recent_post_tags: {
          window_size: 7,
          include: { any_of: Array(21).fill("#DogMom"), min_posts: 2 },
        },
      },
    });

    expect(parsed.filters?.recent_post_tags?.include?.any_of).toEqual([
      "dogmom",
    ]);

    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        query: "beauty",
        filters: {
          recent_post_tags: {
            window_size: 7,
            include: {
              any_of: ["dog", "cat", "bird", "fish", "frog", "#Dog", "toad"],
              min_posts: 2,
            },
          },
        },
      }),
    ).toThrow("at most 5 tags");
  });
});
