import { z } from "zod";
import {
  CampaignTargetSchema,
  RosterFiltersSchema,
} from "./campaign-inputs.js";
import type { HyperstarClient } from "./http.js";
import { JsonObjectSchema } from "./schemas.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Ids = z.array(z.number().int().positive()).min(1).max(100);
const Target = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ids"), creator_ids: Ids }).strict(),
  z
    .object({ type: z.literal("snapshot"), selection_id: z.string().uuid() })
    .strict(),
]);
const Mutation = CampaignTargetSchema.extend({
  target: Target,
  idempotency_key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/),
});
const Copy = Mutation.extend({
  destination_campaign_id: z.number().int().positive(),
});
const Remove = Mutation.extend({ confirmation: z.literal("user_authorized") });
const Prepare = CampaignTargetSchema.extend({ filters: RosterFiltersSchema });
const Snapshot = z.object({
  id: z.string().uuid(),
  campaign_id: z.number().int(),
  creator_ids: z.array(z.number().int()),
  expires_at: z.string(),
});
const Result = z.object({
  operation: z.enum(["copy", "remove"]),
  source_campaign_id: z.number().int(),
  destination_campaign_id: z.number().int().nullable(),
  affected: z.number().int(),
  skipped: z.number().int(),
  rows: z.array(
    z.object({
      source_creator_id: z.number().int(),
      destination_creator_id: z.number().int().nullable(),
      outcome: z.enum(["copied", "removed", "skipped"]),
      reason: z.string().nullable(),
    }),
  ),
});

export function registerRosterOperationTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "prepare_campaign_creator_selection",
    {
      ...toolMetadata("prepare_campaign_creator_selection"),
      inputSchema: Prepare,
    },
    async ({ campaign_id, filters }) =>
      toolResult({
        ...Snapshot.parse(
          await client.post(
            `/v1/campaigns/${campaign_id}/creator-selections`,
            JsonObjectSchema.parse({ filters }),
          ),
        ),
        agent_guidance:
          "Review these exact creator IDs. Use this selection ID for copy/removal; removal requires explicit user approval. Selections expire in 30 minutes.",
      }),
  );
  server.registerTool(
    "copy_campaign_creators",
    { ...toolMetadata("copy_campaign_creators"), inputSchema: Copy },
    async ({ campaign_id, ...body }) =>
      toolResult({
        ...Result.parse(
          await client.post(
            `/v1/campaigns/${campaign_id}/creators:copy`,
            JsonObjectSchema.parse(body),
          ),
        ),
        agent_guidance:
          "Source rows remain in place. A move requires separate approval to remove only the source IDs reported as copied. Reuse this key only for this exact copy request.",
      }),
  );
  server.registerTool(
    "remove_campaign_creators",
    { ...toolMetadata("remove_campaign_creators"), inputSchema: Remove },
    async ({ campaign_id, ...body }) =>
      toolResult(
        Result.parse(
          await client.post(
            `/v1/campaigns/${campaign_id}/creators:remove`,
            JsonObjectSchema.parse(body),
          ),
        ),
      ),
  );
}
