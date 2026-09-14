import { z } from "zod";
import type { HyperstarClient } from "./http.js";
import { queryFrom, compactJsonObject } from "./tool-http-helpers.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Id = z.number().int().positive();
const File = z
  .object({
    file_name: z.string().min(1).max(255),
    content_type: z.string().min(1).max(255),
    size_bytes: z
      .number()
      .int()
      .min(1)
      .max(500 * 1024 * 1024),
    checksum_sha256_base64: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/)
      .optional(),
  })
  .strict();
const Target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email_attachment"), campaign_id: Id }).strict(),
  ...(["contract", "draft", "final"] as const).map((kind) =>
    z
      .object({
        kind: z.literal(kind),
        campaign_id: Id,
        campaign_creator_id: Id,
        replacement_confirmation: z.literal("user_authorized").optional(),
        replace_file_id: Id.optional(),
      })
      .strict(),
  ),
]);
const Transfer = z.object({
  transfer_id: z.string().uuid(),
  state: z.enum(["pending", "completed", "cancelled", "expired"]),
  expires_at: z.string(),
  handoff_url: z.string().url(),
  file: z.object({
    file_name: z.string(),
    content_type: z.string(),
    size_bytes: z.number(),
  }),
  upload: z
    .object({
      upload_url: z.string().url(),
      method: z.literal("PUT"),
      headers: z.record(z.string(), z.string()),
      expires_at: z.string(),
    })
    .nullable(),
  result: z
    .object({
      upload_ref: z.string().nullable(),
      campaign_creator_id: z.number().nullable(),
      outreach_stage: z.string().nullable(),
      outreach_stage_advanced: z.boolean(),
    })
    .nullable(),
});
const TransferId = z.object({ transfer_id: z.string().uuid() }).strict();
const CreatorTarget = z
  .object({ campaign_id: Id, campaign_creator_id: Id })
  .strict();
const FileTarget = CreatorTarget.extend({
  file: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("contract") }).strict(),
    z.object({ kind: z.enum(["draft", "final"]), file_id: Id }).strict(),
  ]),
});
const guidance =
  "PUT the exact file bytes to upload.upload_url with its required headers, then call complete_file_upload. Keep binaries outside MCP JSON. If HTTP upload is unavailable, ask the user to open handoff_url in the same Hyperstar account/workspace, then poll get_file_upload. Only a completed email upload's upload_ref can be attached to the target campaign send; uploading does not send email.";

export function registerFileTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "create_file_upload",
    {
      ...toolMetadata("create_file_upload"),
      inputSchema: z
        .object({
          target: Target,
          file: File,
          idempotency_key: z
            .string()
            .min(1)
            .max(100)
            .regex(/^[A-Za-z0-9._:-]+$/),
        })
        .strict(),
    },
    async (input) =>
      toolResult({
        ...Transfer.parse(
          await client.post("/v1/file-transfers", {
            target: compactJsonObject(Object.entries(input.target)),
            file: compactJsonObject(Object.entries(input.file)),
            idempotency_key: input.idempotency_key,
          }),
        ),
        agent_guidance: guidance,
      }),
  );
  server.registerTool(
    "get_file_upload",
    { ...toolMetadata("get_file_upload"), inputSchema: TransferId },
    async ({ transfer_id }) =>
      toolResult({
        ...Transfer.parse(
          await client.get(`/v1/file-transfers/${transfer_id}`),
        ),
        agent_guidance: guidance,
      }),
  );
  server.registerTool(
    "complete_file_upload",
    { ...toolMetadata("complete_file_upload"), inputSchema: TransferId },
    async ({ transfer_id }) =>
      toolResult(
        Transfer.parse(
          await client.post(`/v1/file-transfers/${transfer_id}/complete`),
        ),
      ),
  );
  server.registerTool(
    "cancel_file_upload",
    {
      ...toolMetadata("cancel_file_upload"),
      inputSchema: TransferId.extend({
        confirmation: z.literal("user_authorized"),
      }),
    },
    async ({ transfer_id }) =>
      toolResult(
        Transfer.parse(
          await client.delete(`/v1/file-transfers/${transfer_id}`),
        ),
      ),
  );
  server.registerTool(
    "get_message_attachment_download",
    {
      ...toolMetadata("get_message_attachment_download"),
      inputSchema: z
        .object({
          platform: z.enum(["tiktok", "instagram", "youtube"]),
          thread_id: Id,
          message_id: Id,
          attachment_id: z
            .string()
            .min(1)
            .max(256)
            .regex(/^[A-Za-z0-9_-]+$/),
        })
        .strict(),
    },
    async ({ platform, thread_id, message_id, attachment_id }) =>
      toolResult(
        z
          .object({
            url: z.string().url(),
            expires_at: z.string(),
            file_name: z.string(),
          })
          .parse(
            await client.get(
              `/v1/threads/${thread_id}/messages/${message_id}/attachments/${attachment_id}/download-url`,
              queryFrom({ platform }),
            ),
          ),
      ),
  );
  server.registerTool(
    "list_campaign_creator_files",
    {
      ...toolMetadata("list_campaign_creator_files"),
      inputSchema: CreatorTarget.extend({
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().nonnegative().default(0),
      }),
    },
    async ({ campaign_id, campaign_creator_id, ...page }) =>
      toolResult(
        z
          .object({
            campaign_creator_id: z.number(),
            total: z.number(),
            next_offset: z.number().nullable(),
            contract_file_name: z.string().nullable(),
            contract_content_type: z.string().nullable(),
            contract_size_bytes: z.number().nullable(),
            content_files: z.array(
              z.object({
                id: z.number(),
                kind: z.enum(["draft", "final"]),
                file_name: z.string(),
                content_type: z.string(),
                size_bytes: z.number(),
                uploaded_at: z.string(),
              }),
            ),
          })
          .parse(
            await client.get(
              `/v1/campaigns/${campaign_id}/influencers/${campaign_creator_id}/files`,
              queryFrom(page),
            ),
          ),
      ),
  );
  server.registerTool(
    "get_campaign_file_download",
    { ...toolMetadata("get_campaign_file_download"), inputSchema: FileTarget },
    async (input) =>
      toolResult(
        z
          .object({ download_url: z.string().url(), file_name: z.string() })
          .parse(await client.get(`${filePath(input)}/download-url`)),
      ),
  );
  server.registerTool(
    "remove_campaign_file",
    {
      ...toolMetadata("remove_campaign_file"),
      inputSchema: FileTarget.extend({
        confirmation: z.literal("user_authorized"),
      }),
    },
    async (input) => {
      await client.delete(filePath(input));
      return toolResult({
        removed: true,
        campaign_creator_id: input.campaign_creator_id,
      });
    },
  );
}

function filePath({
  campaign_id,
  campaign_creator_id,
  file,
}: z.infer<typeof FileTarget>): string {
  const base = `/v1/campaigns/${campaign_id}/influencers/${campaign_creator_id}`;
  return file.kind === "contract"
    ? `${base}/contract`
    : `${base}/content-files/${file.kind}/${file.file_id}`;
}
