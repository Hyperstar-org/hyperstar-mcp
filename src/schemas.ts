import { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    JsonObjectSchema,
  ]),
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  JsonValueSchema,
);

const NonNegativeIntegerSchema = z.number().int().min(0);
const PositiveIntegerSchema = z.number().int().min(1);

export const WhoamiResponseSchema = z.object({
  actor_type: z.enum(["user", "service_account"]),
  user_id: z.string().nullable(),
  service_account_id: z.string().nullable(),
  organization_id: z.string(),
  scopes: z.array(z.string()),
  capabilities: z.object({
    search: z.boolean(),
    campaigns_read: z.boolean(),
    campaigns_write: z.boolean(),
    bulk_email: z.boolean(),
    inbox_read: z.boolean(),
    inbox_write: z.boolean(),
  }),
});

export type WhoamiResponse = z.infer<typeof WhoamiResponseSchema>;

export const WorkspaceSchema = z.object({
  organization_id: z.string().min(1),
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
});

export const WorkspaceListResponseSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
});

export const SearchCreatedResponseSchema = z.object({
  search_id: z.uuid(),
});

export const SearchResultsResponseSchema = z.object({
  creators: z.array(JsonObjectSchema),
  total: NonNegativeIntegerSchema,
  offset: NonNegativeIntegerSchema,
  limit: PositiveIntegerSchema,
});

export const CampaignsResponseSchema = z.object({
  campaigns: z.array(JsonObjectSchema),
  total: NonNegativeIntegerSchema,
  limit: PositiveIntegerSchema,
  offset: NonNegativeIntegerSchema,
});

export const CampaignDetailResponseSchema = JsonObjectSchema;

export const CampaignCreatorsResponseSchema = z
  .object({
    influencers: z.array(JsonObjectSchema),
    total: NonNegativeIntegerSchema,
    limit: PositiveIntegerSchema,
    offset: NonNegativeIntegerSchema,
  })
  .transform(({ influencers, ...page }) => ({
    creators: influencers,
    ...page,
  }));

export const CampaignImportResponseSchema = JsonObjectSchema;
export const BulkEmailReadinessResponseSchema = JsonObjectSchema;
export const BulkEmailJobResponseSchema = JsonObjectSchema;
export const InboxThreadPageResponseSchema = JsonObjectSchema;
export const InboxAggregatesResponseSchema = JsonObjectSchema;
export const InboxWorkspaceStateResponseSchema = JsonObjectSchema;
