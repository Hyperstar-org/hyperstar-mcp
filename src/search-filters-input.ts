import { z } from "zod";
import { JsonObjectSchema } from "./schemas.js";
import { RecentPostTagsSchema } from "./recent-post-tags-input.js";
import {
  AudienceRatioFilterSchema,
  RangeFilterSchema,
} from "./search-filter-primitives.js";

export const SearchFiltersInputSchema = z
  .object({
    has_email: z.boolean().optional(),
    email_contactability: z.enum(["unlocked", "locked", "missing"]).optional(),
    min_media_count: z.number().int().min(0).optional(),
    follower_range: z
      .object({
        min: z.number().int().min(0).nullable().optional(),
        max: z.number().int().min(0).nullable().optional(),
      })
      .strict()
      .optional(),
    is_sales: z.boolean().optional(),
    has_recent_shop_videos: z.boolean().optional(),
    gmv: RangeFilterSchema.optional(),
    gpm: RangeFilterSchema.optional(),
    is_verified: z.boolean().optional(),
    has_tiktok_shop: z.boolean().optional(),
    commercial_user: z.boolean().optional(),
    creator_gender: z.enum(["male", "female"]).optional(),
    creator_language: z.string().trim().min(1).optional(),
    creator_languages: z.array(z.string().trim().min(1)).min(1).optional(),
    category_1: z.string().trim().min(1).optional(),
    category_1_not_in: z.array(z.string().trim().min(1)).optional(),
    avg_views: RangeFilterSchema.optional(),
    avg_engagement_rate: RangeFilterSchema.optional(),
    avg_likes: RangeFilterSchema.optional(),
    avg_comments: RangeFilterSchema.optional(),
    avg_shares: RangeFilterSchema.optional(),
    is_business_account: z.boolean().optional(),
    category_name: z.string().trim().min(1).optional(),
    category_name_not_in: z.array(z.string().trim().min(1)).min(1).optional(),
    views_growth_rate: RangeFilterSchema.optional(),
    engagement_growth_rate: RangeFilterSchema.optional(),
    audience_ratio_male: AudienceRatioFilterSchema.optional(),
    audience_ratio_female: AudienceRatioFilterSchema.optional(),
    audience_ratio_unknown: AudienceRatioFilterSchema.optional(),
    audience_ratio_10s: AudienceRatioFilterSchema.optional(),
    audience_ratio_20s: AudienceRatioFilterSchema.optional(),
    audience_ratio_30s: AudienceRatioFilterSchema.optional(),
    audience_ratio_40s: AudienceRatioFilterSchema.optional(),
    audience_ratio_50s: AudienceRatioFilterSchema.optional(),
    audience_ratio_60_plus: AudienceRatioFilterSchema.optional(),
    audience_ratio_15_24: AudienceRatioFilterSchema.optional(),
    audience_ratio_25_34: AudienceRatioFilterSchema.optional(),
    audience_ratio_35_44: AudienceRatioFilterSchema.optional(),
    audience_ratio_45_54: AudienceRatioFilterSchema.optional(),
    audience_ratio_55_plus: AudienceRatioFilterSchema.optional(),
    audience_ratio_us: AudienceRatioFilterSchema.optional(),
    audience_ratio_gb: AudienceRatioFilterSchema.optional(),
    audience_ratio_kr: AudienceRatioFilterSchema.optional(),
    audience_ratio_jp: AudienceRatioFilterSchema.optional(),
    audience_ratio_de: AudienceRatioFilterSchema.optional(),
    audience_ratio_br: AudienceRatioFilterSchema.optional(),
    audience_ratio_fr: AudienceRatioFilterSchema.optional(),
    audience_ratio_in: AudienceRatioFilterSchema.optional(),
    audience_ratio_id: AudienceRatioFilterSchema.optional(),
    audience_ratio_mx: AudienceRatioFilterSchema.optional(),
    audience_ratio_active: AudienceRatioFilterSchema.optional(),
    recent_post_tags: RecentPostTagsSchema.optional(),
  })
  .strict()
  .transform((value) => JsonObjectSchema.parse(value))
  .describe(
    "structured filters only; put broad niches in query and countries in region.",
  );
