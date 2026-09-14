import { z } from "zod";
import { HyperstarApiError, type HyperstarClient } from "./http.js";
import { JsonObjectSchema } from "./schemas.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Id = z.number().int().positive();
const Reference = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job"), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal("handoff"), id: z.string().uuid() }).strict(),
]);
const Target = z.object({ campaign_id: Id, reference: Reference }).strict();
const Status = z.object({
  job_id: z.string().uuid(),
  campaign_id: Id,
  state: z.enum([
    "awaiting_upload",
    "queued",
    "processing",
    "completed",
    "partial_failure",
    "failed",
    "cancelled",
    "expired",
  ]),
  phase: z.string(),
  total_count: z.number(),
  processed_count: z.number(),
  success_count: z.number(),
  skip_count: z.number(),
  error_count: z.number(),
  warning_count: z.number(),
  quota_state: z.enum(["not_reserved", "reserved", "settled"]),
  reserved_units: z.number(),
  refunded_units: z.number(),
  upload_expires_at: z.string(),
  result_state: z.enum(["not_requested", "pending", "available", "expired"]),
  result_availability: z.enum([
    "not_requested",
    "pending",
    "available",
    "expired",
    "retry_exhausted",
  ]),
  result_attempt_count: z.number(),
  failure_code: z.string().nullable(),
  failure_message: z.string().nullable(),
  issues: z.array(
    z.object({
      row_number: z.number(),
      outcome: z.string(),
      reason_code: z.string(),
      message: z.string().nullable(),
      warning: z.string().nullable(),
      username: z.string().nullable(),
    }),
  ),
  omitted_issue_count: z.number(),
});
const Handoff = z.object({
  handoff_id: z.string().uuid(),
  campaign_id: Id,
  state: z.string(),
  expires_at: z.string(),
  handoff_url: z.string().url(),
  job: Status.nullable(),
});
const Intent = z.object({
  job: Status,
  upload: z
    .object({
      url: z.string().url(),
      fields: z.record(z.string(), z.string()),
      expires_at: z.string(),
    })
    .nullable(),
});
const Create = z
  .object({
    campaign_id: Id,
    idempotency_key: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[!-~]+$/),
    upload: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("browser") }).strict(),
      z
        .object({
          mode: z.literal("direct"),
          filename: z.string().min(1).max(255),
          content_type: z.enum([
            "text/csv",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ]),
          byte_size: z
            .number()
            .int()
            .min(1)
            .max(10 * 1024 * 1024),
          checksum_sha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
        })
        .strict(),
    ]),
  })
  .strict();
const path = (input: z.infer<typeof Target>) =>
  `/v1/campaigns/${input.campaign_id}/${input.reference.type === "job" ? "creator-imports" : "creator-import-handoffs"}/${input.reference.id}`;
const guidance =
  "Keep this reference for retries. Poll at 2, 5, then 10 seconds, at most 12 times per turn; if still pending, return the reference for resumption. Successful AND skipped rows consume upload quota. Reserved units are not the final charge. Never start another import to get a result file.";

export function registerCreatorImportTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "create_campaign_creator_import",
    { ...toolMetadata("create_campaign_creator_import"), inputSchema: Create },
    async ({ campaign_id, idempotency_key, upload }) => {
      const headers = { "Idempotency-Key": idempotency_key };
      if (upload.mode === "browser") {
        const result = Handoff.parse(
          await client.post(
            `/v1/campaigns/${campaign_id}/creator-import-handoffs`,
            {},
            headers,
          ),
        );
        return toolResult({
          ...result,
          reference: { type: "handoff", id: result.handoff_id },
          next_tool: "get_campaign_creator_import",
          next_arguments: {
            campaign_id,
            reference: { type: "handoff", id: result.handoff_id },
          },
          agent_guidance:
            "Ask the user to open handoff_url in the initiating account/workspace, select a CSV/XLSX and click Import. " +
            guidance,
        });
      }
      const { mode: _mode, ...file } = upload;
      const result = Intent.parse(
        await client.post(
          `/v1/campaigns/${campaign_id}/creator-imports/intents`,
          file,
          headers,
        ),
      );
      return toolResult({
        ...result,
        reference: { type: "job", id: result.job.job_id },
        upload_method: "POST",
        next_tool: "confirm_campaign_creator_import",
        next_arguments: {
          campaign_id,
          reference: { type: "job", id: result.job.job_id },
        },
        next_required_arguments: ["user_authorized"],
        agent_guidance:
          "Upload with multipart/form-data POST to upload.url, include every upload.fields entry and put the file part LAST. Do not set Content-Type manually, use PUT, or include binary bytes in MCP JSON. Confirm only after upload and user approval. " +
          guidance,
      });
    },
  );
  server.registerTool(
    "get_campaign_creator_import",
    { ...toolMetadata("get_campaign_creator_import"), inputSchema: Target },
    async (input) => {
      const raw = await client.get(path(input));
      return toolResult({
        ...(input.reference.type === "job"
          ? Status.parse(raw)
          : Handoff.parse(raw)),
        reference: input.reference,
        agent_guidance: guidance,
      });
    },
  );
  server.registerTool(
    "confirm_campaign_creator_import",
    {
      ...toolMetadata("confirm_campaign_creator_import"),
      inputSchema: Target.extend({ user_authorized: z.literal(true) }),
    },
    async (input) => {
      const raw = await client.post(path(input) + "/confirm", {
        user_authorized: true,
      });
      return toolResult({
        ...(input.reference.type === "job"
          ? Status.parse(raw)
          : Handoff.parse(raw)),
        next_tool: "get_campaign_creator_import",
        next_arguments: {
          campaign_id: input.campaign_id,
          reference: input.reference,
        },
        agent_guidance: guidance,
      });
    },
  );
  server.registerTool(
    "cancel_campaign_creator_import",
    { ...toolMetadata("cancel_campaign_creator_import"), inputSchema: Target },
    async (input) => {
      const raw = await client.post(path(input) + "/cancel");
      return toolResult(
        input.reference.type === "job" ? Status.parse(raw) : Handoff.parse(raw),
      );
    },
  );
  server.registerTool(
    "get_campaign_creator_import_results",
    {
      ...toolMetadata("get_campaign_creator_import_results"),
      inputSchema: Target,
    },
    async (input) => {
      try {
        const result = z
          .discriminatedUnion("status", [
            z.object({
              status: z.literal("available"),
              url: z.string().url(),
              expires_at: z.string(),
            }),
            z.object({ status: z.literal("pending") }),
          ])
          .parse(await client.get(path(input) + "/results"));
        return toolResult({
          ...result,
          reference: input.reference,
          agent_guidance: guidance,
        });
      } catch (error) {
        if (!(error instanceof HyperstarApiError)) throw error;
        const detail = JsonObjectSchema.safeParse(error.detail);
        if (
          detail.success &&
          [
            "results_unavailable",
            "result_expired",
            "result_not_requested",
            "import_not_terminal",
          ].includes(String(detail.data.code))
        )
          return toolResult({
            ...detail.data,
            reference: input.reference,
            agent_guidance: guidance,
          });
        throw error;
      }
    },
  );
}
