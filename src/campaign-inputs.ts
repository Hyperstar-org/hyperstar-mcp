import { z } from "zod";
import { CampaignCreatorWorkflowFilterSchema } from "./bulk-email-inputs.js";

export const CampaignTargetSchema = z
  .object({ campaign_id: z.number().int().positive() })
  .strict();
export const RosterFiltersSchema = z
  .object({
    workflow_filter: CampaignCreatorWorkflowFilterSchema.optional(),
    outreach_stage: z.string().trim().min(1).optional(),
    platform: z.enum(["tiktok", "instagram", "youtube"]).optional(),
    country: z.string().trim().min(1).optional(),
    source_type: z
      .enum([
        "saved_list",
        "file_upload",
        "manual_add",
        "form_submission",
        "discovery_search",
      ])
      .optional(),
    search: z.string().trim().min(1).max(500).optional(),
    has_video: z.boolean().optional(),
  })
  .strict();

export const WorkflowCountsInputSchema = RosterFiltersSchema.omit({
  workflow_filter: true,
}).extend(CampaignTargetSchema.shape);

export const CampaignChangesSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    brand: z.string().max(255).optional(),
    description: z.string().max(20000).optional(),
    budget: z.number().finite().nonnegative().optional(),
    product_name: z.string().max(500).optional(),
    landing_page: z.string().max(2048).optional(),
    selling_points: z.array(z.string().max(2000)).max(100).optional(),
    hashtags: z.array(z.string().max(255)).max(100).optional(),
    content_brief: z.string().max(20000).optional(),
    status: z.enum(["active", "paused", "completed"]).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one change",
  );

export const UpdateCampaignInputSchema = CampaignTargetSchema.extend({
  changes: CampaignChangesSchema,
});

export const AddCampaignCreatorInputSchema = CampaignTargetSchema.extend({
  idempotency_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/),
  platform: z.enum(["tiktok", "instagram", "youtube"]),
  creator_id: z.number().int().positive().optional(),
  origin_id: z.string().trim().min(1).max(255).optional(),
  username: z.string().trim().min(1).max(100).optional(),
  nickname: z.string().max(255).optional(),
  email: z.string().email().optional(),
  country: z.string().max(100).optional(),
  notes: z.string().max(10000).optional(),
}).refine(
  (value) =>
    value.creator_id !== undefined ||
    value.origin_id !== undefined ||
    value.username !== undefined,
  "Provide creator_id, origin_id or username",
);

export const CreatorChangesSchema = z
  .object({
    outreach_stage: z
      .enum([
        "added",
        "contacted",
        "replied",
        "negotiating",
        "contracted",
        "draft",
        "final_approved",
        "posted",
        "rejected",
        "cancelled",
      ])
      .optional(),
    email: z.string().email().nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
    contact_phone: z.string().max(100).nullable().optional(),
    quoted_price: z.number().finite().nonnegative().nullable().optional(),
    quoted_currency: z.string().max(16).nullable().optional(),
    negotiated_price: z.number().finite().nonnegative().nullable().optional(),
    negotiated_currency: z.string().max(16).nullable().optional(),
    payment_method: z
      .enum(["unset", "paypal", "bank_transfer", "other"])
      .nullable()
      .optional(),
    secondary_usage_status: z
      .enum(["undecided", "allowed", "denied"])
      .nullable()
      .optional(),
    collaboration_terms: z.string().max(10000).nullable().optional(),
    delivery_address: z.string().max(5000).nullable().optional(),
    payment_info: z.string().max(5000).nullable().optional(),
    message: z.string().max(10000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one change",
  );

export const UpdateCampaignCreatorInputSchema = CampaignTargetSchema.extend({
  campaign_creator_id: z.number().int().positive(),
  changes: CreatorChangesSchema,
});
