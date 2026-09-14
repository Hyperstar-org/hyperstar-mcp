import { z } from "zod";
import type { HyperstarClient } from "./http.js";
import { BulkEmailJobResponseSchema } from "./schemas.js";
import { bulkEmailQueuedResult } from "./bulk-email-guidance.js";
import { queryFrom } from "./tool-http-helpers.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const WaveInput = z.object({ wave_id: z.string().uuid() }).strict();
const Key = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
const Wave = z.object({
  wave_id: z.string().uuid(),
  campaign_id: z.number().int(),
  kind: z.enum(["initial", "follow_up", "retry"]),
  sequence_number: z.number().int(),
  requested_parent_wave_id: z.string().nullable(),
  status: z.string(),
  state_counts: z.object({
    pending: z.number().int(),
    queued: z.number().int(),
    sending: z.number().int(),
    sent: z.number().int(),
    delivered: z.number().int(),
    delivery_delayed: z.number().int(),
    failed: z.number().int(),
    skipped: z.number().int(),
    uncertain: z.number().int(),
    bounced: z.number().int(),
    complained: z.number().int(),
  }),
  completed_count: z.number().int(),
  provider_accepted_count: z.number().int(),
  total_count: z.number().int(),
  started_at: z.string().nullable(),
  last_progress_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  can_cancel: z.boolean(),
  is_stalled: z.boolean(),
  status_reason: z.string(),
});
const CancelResult = z.object({
  wave_id: z.string().uuid(),
  status: z.enum(["cancelling", "cancelled"]),
  skipped_count: z.number().int(),
  settling_count: z.number().int(),
  unresolved_uncertain_count: z.number().int(),
});

export function registerEmailWaveTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "list_email_senders",
    {
      ...toolMetadata("list_email_senders"),
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          offset: z.number().int().min(0).default(0),
        })
        .strict(),
    },
    async (input) =>
      toolResult({
        ...z
          .object({
            senders: z.array(
              z.object({
                email_account_id: z.string().uuid(),
                provider: z.string(),
                email: z.string(),
                display_name: z.string(),
              }),
            ),
            default_channel: z.string(),
            total: z.number().int(),
            next_offset: z.number().int().nullable(),
          })
          .parse(await client.get("/v1/email-senders", queryFrom(input))),
        agent_guidance:
          "Omit email_account_id to retain the default SES sender. Connected senders are eligible at discovery time and rechecked on send. Follow-up readiness identifies any required prior sender.",
      }),
  );
  server.registerTool(
    "list_campaign_email_waves",
    {
      ...toolMetadata("list_campaign_email_waves"),
      inputSchema: z
        .object({
          campaign_id: z.number().int().positive(),
          state: z
            .enum(["active", "recent", "active,recent"])
            .default("active,recent"),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .strict(),
    },
    async (input) =>
      toolResult(
        z
          .object({ waves: z.array(Wave) })
          .parse(await client.get("/v1/bulk-email/waves", queryFrom(input))),
      ),
  );
  server.registerTool(
    "get_campaign_email_wave",
    { ...toolMetadata("get_campaign_email_wave"), inputSchema: WaveInput },
    async ({ wave_id }) =>
      toolResult(
        Wave.parse(await client.get(`/v1/bulk-email/waves/${wave_id}`)),
      ),
  );
  server.registerTool(
    "cancel_campaign_email_wave",
    {
      ...toolMetadata("cancel_campaign_email_wave"),
      inputSchema: WaveInput.extend({
        idempotency_key: Key,
        confirmation: z.literal("user_authorized"),
      }),
    },
    async ({ wave_id, idempotency_key }) =>
      toolResult({
        ...CancelResult.parse(
          await client.post(`/v1/bulk-email/waves/${wave_id}/cancel`, {
            idempotency_key,
          }),
        ),
        agent_guidance:
          "Cancellation stops eligible pending work. Delivered mail cannot be recalled; in-flight or uncertain recipients may remain unresolved. Poll get_campaign_email_wave.",
      }),
  );
  server.registerTool(
    "retry_campaign_email_wave",
    {
      ...toolMetadata("retry_campaign_email_wave"),
      inputSchema: WaveInput.extend({
        idempotency_key: Key,
        send_confirmation: z.literal("user_authorized"),
      }),
    },
    async ({ wave_id, ...body }) =>
      toolResult(
        bulkEmailQueuedResult(
          BulkEmailJobResponseSchema.parse(
            await client.post(`/v1/bulk-email/waves/${wave_id}/retry`, body),
          ),
        ),
      ),
  );
}
