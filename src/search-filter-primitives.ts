import { z } from "zod";

export const SearchKindSchema = z
  .enum(["semantic", "reference", "keyword"])
  .describe(
    "semantic for meaning-based search (add product for AI Product-Fit), reference for lookalike search with a reference object, keyword for YouTube channel-text matching.",
  );

export const SearchSortBySchema = z.enum([
  "relevance",
  "matchScore",
  "follower_count",
  "engagement_rate",
  "avg_views",
  "views_growth_rate",
  "gmv",
  "gpm",
  "tag_match_ratio",
]);

export const RangeFilterSchema = z
  .object({
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
  })
  .strict();

export const AudienceRatioFilterSchema = z
  .object({
    min: z.number().finite().min(0).max(1).nullable().optional(),
    max: z.number().finite().min(0).max(1).nullable().optional(),
  })
  .strict();
