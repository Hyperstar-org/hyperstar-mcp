import { describe, expect, it } from "vitest";

import { SearchCreatorsInputSchema } from "../src/tool-inputs.js";

describe("recent-post tag search input", () => {
  it("applies the length limit after trimming one hash prefix", () => {
    const tag = "x".repeat(64);
    const parsed = SearchCreatorsInputSchema.parse({
      kind: "semantic",
      platform: "tiktok",
      region: "US",
      query: "beauty",
      filters: {
        recent_post_tags: {
          window_size: 7,
          include: { any_of: [`  #${tag}  `], min_posts: 2 },
        },
      },
    });

    expect(parsed.filters?.recent_post_tags?.include?.any_of).toEqual([tag]);
  });

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
              any_of: ["dog", "cat"],
              min_posts: 2,
            },
          },
        },
      }),
    ).toThrow("at most 1 tag");
  });

  it("normalizes tags and accepts tag-match sorting", () => {
    expect(
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "instagram",
        region: "US",
        query: "dog creators",
        filters: {
          recent_post_tags: {
            window_size: 7,
            include: { any_of: [" #DogMom ", "dogmom"], min_posts: 2 },
          },
          category_name_not_in: ["Business"],
        },
        sort_by: "tag_match_ratio",
        sort_order: "desc",
      }),
    ).toMatchObject({
      filters: {
        recent_post_tags: {
          include: { any_of: ["dogmom"], min_posts: 2 },
        },
      },
      sort_by: "tag_match_ratio",
    });
  });

  it("rejects tag-match sorting without its predicate", () => {
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "dog creators",
        sort_by: "tag_match_ratio",
      }),
    ).toThrow("requires recent_post_tags");
  });
});
