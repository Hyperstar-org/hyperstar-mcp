import { RosterFiltersSchema } from "./campaign-inputs.js";
import { z } from "zod";

import {
  CampaignRecipientTargetSchema,
  EmailSubjectSchema,
  IdempotencyKeySchema,
  type CheckBulkEmailReadinessInput,
  type StartBulkEmailInput,
} from "./bulk-email-inputs.js";
import type { JsonObject } from "./http.js";
import { JsonObjectSchema } from "./schemas.js";
import { SearchFiltersInputSchema } from "./search-filters-input.js";
import {
  SearchKindSchema,
  SearchSortBySchema,
} from "./search-filter-primitives.js";

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
const SearchPlatformSchema = z.enum(["tiktok", "instagram", "youtube"]);
const InboxPlatformSchema = z.enum(["tiktok", "instagram", "youtube", "buyer"]);
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
    if (
      value.platform !== "tiktok" &&
      value.filters?.has_recent_shop_videos !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "has_recent_shop_videos is only available for TikTok searches",
        path: ["filters", "has_recent_shop_videos"],
      });
    }
    if (
      (value.kind === "semantic" || value.kind === "keyword") &&
      value.query === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: `${value.kind} searches require query`,
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
    if (value.platform === "youtube" && value.kind !== "keyword") {
      context.addIssue({
        code: "custom",
        message: "YouTube supports keyword creator search only",
        path: ["kind"],
      });
    }
    if (value.platform !== "youtube" && value.kind === "keyword") {
      context.addIssue({
        code: "custom",
        message: "keyword creator search is available only for YouTube",
        path: ["kind"],
      });
    }
    if (value.kind !== "reference" && value.reference !== undefined) {
      context.addIssue({
        code: "custom",
        message: `${value.kind} searches do not accept a reference`,
        path: ["reference"],
      });
    }
    if (
      value.platform === "youtube" &&
      value.sort_by !== undefined &&
      value.sort_by !== "relevance" &&
      value.sort_by !== "matchScore"
    ) {
      context.addIssue({
        code: "custom",
        message: "metric sorting is unavailable for YouTube searches",
        path: ["sort_by"],
      });
    }
    if (value.platform === "youtube" && value.filters !== undefined) {
      const supported = new Set([
        "has_email",
        "follower_range",
        "creator_language",
      ]);
      for (const [key, filterValue] of Object.entries(value.filters)) {
        if (
          !supported.has(key) &&
          filterValue !== undefined &&
          filterValue !== null
        ) {
          context.addIssue({
            code: "custom",
            message: `filter ${key} is unavailable for YouTube searches`,
            path: ["filters", key],
          });
        }
      }
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
    if (
      value.platform === "youtube" &&
      value.filters?.recent_post_tags !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "recent_post_tags is unavailable for YouTube searches",
        path: ["filters", "recent_post_tags"],
      });
    }
    if (
      value.filters?.recent_post_tags !== undefined &&
      value.filters.email_contactability !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "recent_post_tags cannot be combined with email_contactability",
        path: ["filters", "email_contactability"],
      });
    }
    if (
      value.sort_by === "tag_match_ratio" &&
      value.filters?.recent_post_tags === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "tag_match_ratio requires recent_post_tags",
        path: ["sort_by"],
      });
    }
    if (
      value.filters?.category_name_not_in !== undefined &&
      value.platform !== "instagram"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "category_name_not_in is only available for Instagram searches",
        path: ["filters", "category_name_not_in"],
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

export const CampaignCreatorsInputSchema = RosterFiltersSchema.extend({
  campaign_id: CampaignIdSchema,
  limit: PositivePageLimitSchema.max(2000).optional(),
  offset: z.number().int().min(0).optional(),
}).strict();

export const BulkEmailJobInputSchema = z
  .object({
    job_id: z.string().trim().min(1),
  })
  .strict();

export const StartEmailUnlockInputSchema = z
  .object({
    campaign_id: CampaignIdSchema,
    recipient_target: CampaignRecipientTargetSchema,
    maximum_chargeable_unlocks: z.number().int().min(0),
    confirm_cost: z
      .literal(true)
      .describe(
        "Required explicit confirmation that email-unlock credits may be charged.",
      ),
    idempotency_key: IdempotencyKeyInputSchema,
  })
  .strict();

export const EmailUnlockJobInputSchema = z
  .object({
    job_id: z.uuid(),
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
type StartEmailUnlockInput = z.infer<typeof StartEmailUnlockInputSchema>;
type EmailUnlockJobInput = z.infer<typeof EmailUnlockJobInputSchema>;
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
  readonly startEmailUnlock: (
    input: StartEmailUnlockInput,
  ) => Promise<JsonObject>;
  readonly getEmailUnlockJob: (
    input: EmailUnlockJobInput,
  ) => Promise<JsonObject>;
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
