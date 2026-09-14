import { z } from "zod";
import type { HyperstarClient } from "./http.js";
import { JsonObjectSchema } from "./schemas.js";
import { queryFrom } from "./tool-http-helpers.js";
import { toolResult } from "./tool-result.js";
import { toolMetadata } from "./tool-metadata.js";
import type { ToolRegistrar } from "./tool-registrar.js";
import {
  AddCampaignCreatorInputSchema,
  CampaignTargetSchema,
  UpdateCampaignCreatorInputSchema,
  UpdateCampaignInputSchema,
  WorkflowCountsInputSchema,
} from "./campaign-inputs.js";

export const CampaignDetailsSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  brand: z.string().nullable(),
  status: z.string(),
  budget: z.number().nullable(),
  total_creators: z.number().int(),
  total_videos: z.number().int(),
  total_views: z.number(),
  created_at: z.string(),
  description: z.string().nullable(),
  product_name: z.string().nullable(),
  landing_page: z.string().nullable(),
  selling_points: z.array(z.string()),
  hashtags: z.array(z.string()),
  content_brief: z.string().nullable(),
});

export const CampaignCreatorDetailsSchema = z.object({
  id: z.number().int().positive(),
  campaign_id: z.number().int().positive(),
  platform: z.string(),
  creator_id: z.number().nullable(),
  origin_id: z.string().nullable(),
  username: z.string().nullable(),
  nickname: z.string().nullable(),
  outreach_stage: z.string(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  country: z.string().nullable(),
  source_type: z.string().nullable(),
  negotiated_price: z.number().nullable(),
  negotiated_currency: z.string().nullable(),
  payment_method: z.string().nullable(),
  secondary_usage_status: z.string().nullable(),
  contact_phone: z.string().nullable(),
  quoted_price: z.number().nullable(),
  collaboration_terms: z.string().nullable(),
  delivery_address: z.string().nullable(),
  payment_info: z.string().nullable(),
  form_message: z.string().nullable(),
});

const AddedCampaignCreatorSchema = CampaignCreatorDetailsSchema.omit({
  contact_phone: true,
  quoted_price: true,
  collaboration_terms: true,
  delivery_address: true,
  payment_info: true,
  form_message: true,
});

export function registerCampaignTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "get_campaign",
    { ...toolMetadata("get_campaign"), inputSchema: CampaignTargetSchema },
    async ({ campaign_id }) =>
      toolResult(
        CampaignDetailsSchema.parse(
          await client.get(`/v1/campaigns/${campaign_id}`),
        ),
      ),
  );
  server.registerTool(
    "update_campaign",
    {
      ...toolMetadata("update_campaign"),
      inputSchema: UpdateCampaignInputSchema,
    },
    async ({ campaign_id, changes }) =>
      toolResult(
        CampaignDetailsSchema.parse(
          await client.put(
            `/v1/campaigns/${campaign_id}`,
            JsonObjectSchema.parse(changes),
          ),
        ),
      ),
  );
  server.registerTool(
    "get_campaign_workflow_counts",
    {
      ...toolMetadata("get_campaign_workflow_counts"),
      inputSchema: WorkflowCountsInputSchema,
    },
    async ({ campaign_id, ...filters }) =>
      toolResult(
        z
          .record(
            z.enum([
              "all",
              "email",
              "email_not_sent",
              "send_unavailable",
              "email_sent",
              "delivery_failed",
              "replied",
              "negotiating",
              "rejected_hold",
              "rejected",
              "hold",
              "contract",
              "contracted",
              "content",
              "draft",
              "final_approved",
              "posted",
            ]),
            z.number().int().nonnegative(),
          )
          .parse(
            await client.get(
              `/v1/campaigns/${campaign_id}/influencers/workflow-counts`,
              queryFrom(filters),
            ),
          ),
      ),
  );
  server.registerTool(
    "add_campaign_creator",
    {
      ...toolMetadata("add_campaign_creator"),
      inputSchema: AddCampaignCreatorInputSchema,
    },
    async ({ campaign_id, ...creator }) =>
      toolResult(
        AddedCampaignCreatorSchema.parse(
          await client.post(
            `/v1/campaigns/${campaign_id}/creators`,
            JsonObjectSchema.parse({ ...creator, source_type: "manual_add" }),
          ),
        ),
      ),
  );
  server.registerTool(
    "update_campaign_creator",
    {
      ...toolMetadata("update_campaign_creator"),
      inputSchema: UpdateCampaignCreatorInputSchema,
    },
    async ({ campaign_id, campaign_creator_id, changes }) =>
      toolResult(
        CampaignCreatorDetailsSchema.parse(
          await client.put(
            `/v1/campaigns/${campaign_id}/influencers/${campaign_creator_id}`,
            JsonObjectSchema.parse(changes),
          ),
        ),
      ),
  );
}
