import { z } from "zod";

export const SearchKindSchema = z
  .enum(["semantic", "reference", "keyword"])
  .describe(
    "Use keyword for YouTube, semantic for TikTok/Instagram text search, and reference only with a reference object.",
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
