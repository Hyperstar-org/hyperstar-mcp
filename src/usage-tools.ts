import { z } from "zod";
import type { HyperstarClient } from "./http.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Count = z.number().int().positive();
const UsageBase = z.object({
  feature: z.enum([
    "email_unlock",
    "upload_db",
    "save_people",
    "campaign_active",
  ]),
  availability: z.enum([
    "available",
    "expired",
    "not_initialized",
    "missing_plan",
    "unavailable",
  ]),
  limit: z.number().nullable(),
  period_end: z.string().nullable(),
  reset_policy: z.enum(["none", "monthly", "trial"]).nullable(),
});
const Usage = z.discriminatedUnion("kind", [
  UsageBase.extend({
    kind: z.literal("quota"),
    stored_units: z.number().nullable(),
    available_units: z.number().nullable(),
  }),
  UsageBase.extend({
    kind: z.literal("credit"),
    stored_units: z.number().nullable(),
    available_units: z.number().nullable(),
  }),
  UsageBase.extend({
    kind: z.literal("capacity"),
    in_use: z.number().nullable(),
    available_units: z.number().nullable(),
  }),
  UsageBase.extend({ kind: z.literal("flag"), level: z.number().nullable() }),
]);
const Check = z.discriminatedUnion("operation", [
  z
    .object({ operation: z.literal("spreadsheet_import"), row_count: Count })
    .strict(),
  z.object({ operation: z.literal("save_creators"), count: Count }).strict(),
  z.object({ operation: z.literal("create_campaign") }).strict(),
  z
    .object({
      operation: z.literal("email_unlock"),
      target: z.discriminatedUnion("type", [
        z.object({ type: z.literal("count"), count: Count }).strict(),
        z
          .object({
            type: z.literal("campaign_creators"),
            campaign_id: Count,
            campaign_creator_ids: z
              .array(Count)
              .min(1)
              .max(500)
              .refine(
                (ids) => new Set(ids).size === ids.length,
                "IDs must be unique",
              ),
          })
          .strict(),
      ]),
    })
    .strict(),
]);
const Estimate = z.object({
  campaign_id: Count,
  campaign_creator_ids: z.array(Count),
  authorization_maximum: z.number(),
  estimated_units: z.number(),
  active_grants: z.number(),
  free_restorations: z.number(),
  missing_catalog_email: z.number(),
});
const guidance =
  "Read-only snapshot; reserves nothing and covers only the selected entitlement. Concurrent usage and expiry can change execution. Import row_count excludes the header: all staged rows are reserved, successful and skipped rows charged, errors/unprocessed rows refunded. Optional video columns may need tracking capacity.";

export function registerUsageTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "get_workspace_usage",
    {
      ...toolMetadata("get_workspace_usage"),
      inputSchema: z.object({}).strict(),
    },
    async () =>
      toolResult({
        ...z
          .object({
            as_of: z.string(),
            plan_id: z.string().uuid().nullable(),
            plan_code: z.string().nullable(),
            entries: z.array(Usage),
          })
          .parse(await client.get("/v1/workspace/usage")),
        agent_guidance: guidance,
      }),
  );
  server.registerTool(
    "check_operation_capacity",
    {
      ...toolMetadata("check_operation_capacity"),
      inputSchema: z.object({ request: Check }).strict(),
    },
    async ({ request }) => {
      const result = z
        .object({
          as_of: z.string(),
          status: z.enum(["allowed_now", "denied_now", "unavailable"]),
          units: z.number(),
          unit_basis: z.enum([
            "requested",
            "upper_bound",
            "eligibility_estimated",
          ]),
          usage: Usage,
          shortfall: z.number().nullable(),
          reason: z.string().nullable(),
          estimate: Estimate.nullable(),
          advisory: z.literal(true),
          reserves_units: z.literal(false),
        })
        .parse(await client.post("/v1/workspace/usage/check", request));
      return toolResult({
        ...result,
        agent_guidance:
          guidance +
          " For roster unlocks show BOTH estimated_units and authorization_maximum. After explicit approval, call start_email_unlock with the returned campaign and exact campaign_creator_ids, and max_chargeable_count equal to the approved authorization_maximum. Never silently increase the cap. Only authorization_maximum=0 means no unlock is needed; estimated_units=0 may still require free restoration and confirmation.",
      });
    },
  );
}
