import { describe, expect, it } from "vitest";
import { SearchCreatorsInputSchema } from "../src/tool-inputs.js";

describe("recent product-link search", () => {
  it.each([true, false])(
    "forwards TikTok membership %s independently of seller status",
    (value) => {
      const parsed = SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "beauty",
        filters: {
          has_recent_shop_videos: value,
          has_tiktok_shop: true,
          is_sales: true,
        },
      });
      expect(parsed.filters).toEqual({
        has_recent_shop_videos: value,
        has_tiktok_shop: true,
        is_sales: true,
      });
    },
  );
  it.each(["instagram", "youtube"])(
    "rejects both boolean values on %s",
    (platform) => {
      for (const value of [true, false]) {
        expect(() =>
          SearchCreatorsInputSchema.parse({
            kind: platform === "youtube" ? "keyword" : "semantic",
            platform,
            region: "US",
            query: "beauty",
            filters: { has_recent_shop_videos: value },
          }),
        ).toThrow("has_recent_shop_videos");
      }
    },
  );
});
