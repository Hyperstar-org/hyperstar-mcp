import { z } from "zod";

import {
  EmailSubjectSchema,
  IdempotencyKeySchema,
  type CheckBulkEmailReadinessInput,
  type StartBulkEmailInput,
} from "./bulk-email-inputs.js";
import type { JsonObject } from "./http.js";
import { JsonObjectSchema } from "./schemas.js";

export {
  CheckBulkEmailReadinessDiscoveryInputSchema,
  CheckBulkEmailReadinessInputSchema,
  StartBulkEmailDiscoveryInputSchema,
  StartBulkEmailInputSchema,
  normalizeCheckBulkEmailReadinessInput,
  normalizeStartBulkEmailInput,
  type CampaignCreatorSelectionInput,
  type CheckBulkEmailReadinessInput,
  type StartBulkEmailInput,
} from "./bulk-email-inputs.js";

const PositivePageLimitSchema = z.number().int().min(1);
const SearchKindSchema = z
  .enum(["semantic", "reference"])
  .describe(
    "Use semantic with a natural-language query; use reference only when passing a reference object.",
  );
const SearchPlatformSchema = z.enum(["tiktok", "instagram"]);
const InboxPlatformSchema = z.enum(["tiktok", "instagram", "buyer"]);
const SendConfirmationSchema = z
  .literal("user_authorized")
  .describe(
    'Required literal "user_authorized"; set it only after the user explicitly approved this real send.',
  );
const SearchIdSchema = z
  .uuid()
  .describe(
    "Search UUID returned by search_creators; pass it instead of pasting creator rows.",
  );
// Backend workspace identifiers are organization IDs such as "org_123", not UUIDs.
const WorkspaceOrganizationIdSchema = z.string().trim().min(1);
const SearchRegionSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/))
  .describe("two-letter country or market code such as US, KR, JP, or GB.");
const SearchCreateLimitSchema = PositivePageLimitSchema.max(10000);
const SearchResultLimitSchema = PositivePageLimitSchema.max(100);
const SearchResultDetailLevelSchema = z.enum(["summary", "full"]);
const SearchSortBySchema = z.enum([
  "relevance",
  "matchScore",
  "follower_count",
  "engagement_rate",
  "avg_views",
  "views_growth_rate",
  "gmv",
  "gpm",
]);
const RangeFilterSchema = z
  .object({
    min: z.number().finite().nullable().optional(),
    max: z.number().finite().nullable().optional(),
  })
  .strict();
const AudienceRatioFilterSchema = z
  .object({
    min: z.number().finite().min(0).max(1).nullable().optional(),
    max: z.number().finite().min(0).max(1).nullable().optional(),
  })
  .strict();
const SearchFiltersInputSchema = z
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
    gmv: RangeFilterSchema.optional(),
    gpm: RangeFilterSchema.optional(),
    is_verified: z.boolean().optional(),
    has_tiktok_shop: z.boolean().optional(),
    commercial_user: z.boolean().optional(),
    creator_gender: z.enum(["male", "female"]).optional(),
    creator_language: z.string().trim().min(1).optional(),
    category_1: z.string().trim().min(1).optional(),
    category_1_not_in: z.array(z.string().trim().min(1)).optional(),
    category_2: z.string().trim().min(1).optional(),
    category_2_not_in: z.array(z.string().trim().min(1)).optional(),
    avg_views: RangeFilterSchema.optional(),
    avg_engagement_rate: RangeFilterSchema.optional(),
    avg_likes: RangeFilterSchema.optional(),
    avg_comments: RangeFilterSchema.optional(),
    avg_shares: RangeFilterSchema.optional(),
    is_business_account: z.boolean().optional(),
    category_name: z.string().trim().min(1).optional(),
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
  })
  .strict()
  .transform((value) => JsonObjectSchema.parse(value))
  .describe(
    "structured filters only; put broad niches in query and countries in region.",
  );
const CampaignIdSchema = z
  .number()
  .int()
  .positive()
  .describe("Campaign ID from list_campaigns or create_campaign.");
const IdempotencyKeyInputSchema = IdempotencyKeySchema.describe(
  "Stable retry key for this exact send attempt; reuse it when retrying the same user-approved action.",
);
export const SearchCreatorsInputSchema = z
  .object({
    kind: SearchKindSchema,
    platform: SearchPlatformSchema,
    region: SearchRegionSchema,
    query: z.string().trim().min(1).optional(),
    filters: SearchFiltersInputSchema.optional(),
    limit: SearchCreateLimitSchema.optional(),
    reference: JsonObjectSchema.optional(),
    sort_by: SearchSortBySchema.optional(),
    sort_order: z.enum(["asc", "desc"]).optional(),
    detail_level: SearchResultDetailLevelSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "semantic" && value.query === undefined) {
      context.addIssue({
        code: "custom",
        message: "semantic searches require query",
        path: ["query"],
      });
    }
    if (value.kind === "reference" && value.reference === undefined) {
      context.addIssue({
        code: "custom",
        message: "reference searches require reference",
        path: ["reference"],
      });
    }
    if (
      value.platform !== "tiktok" &&
      (value.sort_by === "gmv" || value.sort_by === "gpm")
    ) {
      context.addIssue({
        code: "custom",
        message: "gmv and gpm sorting are only available for TikTok searches",
        path: ["sort_by"],
      });
    }
    if (value.platform !== "tiktok" && value.filters?.gmv !== undefined) {
      context.addIssue({
        code: "custom",
        message: "gmv filters are only available for TikTok searches",
        path: ["filters", "gmv"],
      });
    }
    if (value.platform !== "tiktok" && value.filters?.gpm !== undefined) {
      context.addIssue({
        code: "custom",
        message: "gpm filters are only available for TikTok searches",
        path: ["filters", "gpm"],
      });
    }
  });

export const WhoamiInputSchema = z.object({}).strict();

export const ListWorkspacesInputSchema = z.object({}).strict();

export const SelectWorkspaceInputSchema = z
  .object({
    organization_id: WorkspaceOrganizationIdSchema,
  })
  .strict();

export const WorkflowGuideInputSchema = z.object({}).strict();

export const GetSearchResultsInputSchema = z
  .object({
    search_id: SearchIdSchema,
    limit: SearchResultLimitSchema.optional(),
    offset: z.number().int().min(0).optional(),
    detail_level: SearchResultDetailLevelSchema.optional(),
  })
  .strict();

export const SaveSearchResultsToCampaignInputSchema = z
  .object({
    campaign_id: CampaignIdSchema,
    search_id: SearchIdSchema,
    excluded_origin_ids: z.array(z.string().min(1)).optional(),
    limit: PositivePageLimitSchema.max(10000).optional(),
    reference_id: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const ListCampaignsInputSchema = z
  .object({
    status: z.string().trim().min(1).optional(),
    sync: z.boolean().optional(),
    limit: PositivePageLimitSchema.max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

export const CreateCampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    brand: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    budget: z.number().finite().nonnegative().optional(),
    product_name: z.string().trim().min(1).optional(),
    landing_page: z.string().trim().min(1).optional(),
    selling_points: z.array(z.string().trim().min(1)).optional(),
    hashtags: z.array(z.string().trim().min(1)).optional(),
    content_brief: z.string().trim().min(1).optional(),
    amazon_product_urls: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const CampaignCreatorsInputSchema = z
  .object({
    campaign_id: CampaignIdSchema,
    limit: PositivePageLimitSchema.max(2000).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

export const BulkEmailJobInputSchema = z
  .object({
    job_id: z.string().trim().min(1),
  })
  .strict();

export const InboxFiltersInputSchema = z
  .object({
    platforms: z.array(InboxPlatformSchema).optional(),
    campaign_ids: z.array(z.number().int().positive()).optional(),
    outreach_stages: z.array(z.string().trim().min(1)).optional(),
    label_ids: z.array(z.number().int().positive()).optional(),
    bulk_job_ids: z.array(z.uuid()).optional(),
    unread_only: z.boolean().optional(),
    actionable_only: z.boolean().optional(),
    attention: z.boolean().optional(),
    archived: z.boolean().optional(),
    snoozed: z.boolean().optional(),
    has_attachments: z.boolean().optional(),
    search: z.string().trim().min(1).optional(),
    last_message_at_from: z.iso.datetime().optional(),
    last_message_at_to: z.iso.datetime().optional(),
  })
  .strict();

export const ListInboxThreadsInputSchema = InboxFiltersInputSchema.extend({
  sort_field: z.enum(["last_message_at"]).optional(),
  sort_descending: z.boolean().optional(),
  limit: PositivePageLimitSchema.max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

export const UpdateInboxThreadStateInputSchema = z
  .object({
    platform: InboxPlatformSchema,
    thread_id: z.number().int().positive(),
    archived: z.boolean().optional(),
    snoozed_until: z.iso.datetime().optional(),
    clear_snooze: z.boolean().optional(),
    starred: z.boolean().optional(),
    read_state: z.enum(["read", "unread"]).optional(),
    clear_read_state: z.boolean().optional(),
  })
  .strict();

export const GetInboxThreadMessagesInputSchema = z
  .object({
    platform: InboxPlatformSchema,
    thread_id: z.number().int().positive(),
  })
  .strict();

export const SendInboxReplyInputSchema = z
  .object({
    platform: InboxPlatformSchema,
    thread_id: z.number().int().positive(),
    subject: EmailSubjectSchema,
    body_text: z.string().trim().min(1),
    attachments: z.array(z.string().trim().min(1)).optional(),
    campaign_creator_id: z.number().int().positive().optional(),
    idempotency_key: IdempotencyKeyInputSchema,
    send_confirmation: SendConfirmationSchema,
  })
  .strict();

type SearchCreatorsInput = z.infer<typeof SearchCreatorsInputSchema>;
type ListWorkspacesInput = z.infer<typeof ListWorkspacesInputSchema>;
type SelectWorkspaceInput = z.infer<typeof SelectWorkspaceInputSchema>;
type WorkflowGuideInput = z.infer<typeof WorkflowGuideInputSchema>;
type GetSearchResultsInput = z.infer<typeof GetSearchResultsInputSchema>;
type SaveSearchResultsToCampaignInput = z.infer<
  typeof SaveSearchResultsToCampaignInputSchema
>;
type ListCampaignsInput = z.infer<typeof ListCampaignsInputSchema>;
type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;
type CampaignCreatorsInput = z.infer<typeof CampaignCreatorsInputSchema>;
type BulkEmailJobInput = z.infer<typeof BulkEmailJobInputSchema>;
type InboxFiltersInput = z.infer<typeof InboxFiltersInputSchema>;
type ListInboxThreadsInput = z.infer<typeof ListInboxThreadsInputSchema>;
type UpdateInboxThreadStateInput = z.infer<
  typeof UpdateInboxThreadStateInputSchema
>;
type GetInboxThreadMessagesInput = z.infer<
  typeof GetInboxThreadMessagesInputSchema
>;
type SendInboxReplyInput = z.infer<typeof SendInboxReplyInputSchema>;

export type HyperstarToolHandlers = {
  readonly hyperstarWhoami: () => Promise<JsonObject>;
  readonly listWorkspaces: (input?: ListWorkspacesInput) => Promise<JsonObject>;
  readonly selectWorkspace: (
    input: SelectWorkspaceInput,
  ) => Promise<JsonObject>;
  readonly getHyperstarWorkflowGuide: (
    input?: WorkflowGuideInput,
  ) => Promise<JsonObject>;
  readonly searchCreators: (input: SearchCreatorsInput) => Promise<JsonObject>;
  readonly getSearchResults: (
    input: GetSearchResultsInput,
  ) => Promise<JsonObject>;
  readonly saveSearchResultsToCampaign: (
    input: SaveSearchResultsToCampaignInput,
  ) => Promise<JsonObject>;
  readonly listCampaigns: (input?: ListCampaignsInput) => Promise<JsonObject>;
  readonly createCampaign: (input: CreateCampaignInput) => Promise<JsonObject>;
  readonly listCampaignCreators: (
    input: CampaignCreatorsInput,
  ) => Promise<JsonObject>;
  readonly checkBulkEmailReadiness: (
    input: CheckBulkEmailReadinessInput,
  ) => Promise<JsonObject>;
  readonly startBulkEmail: (input: StartBulkEmailInput) => Promise<JsonObject>;
  readonly getBulkEmailJob: (input: BulkEmailJobInput) => Promise<JsonObject>;
  readonly listInboxThreads: (
    input: ListInboxThreadsInput,
  ) => Promise<JsonObject>;
  readonly getInboxAggregates: (
    input: InboxFiltersInput,
  ) => Promise<JsonObject>;
  readonly updateInboxThreadState: (
    input: UpdateInboxThreadStateInput,
  ) => Promise<JsonObject>;
  readonly getInboxThreadMessages: (
    input: GetInboxThreadMessagesInput,
  ) => Promise<JsonObject>;
  readonly sendInboxReply: (input: SendInboxReplyInput) => Promise<JsonObject>;
};
