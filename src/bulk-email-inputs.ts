import { z } from "zod";

export const EmailSubjectSchema = z.string().trim().min(1).max(500);

const HeaderValueSchema = z
  .string()
  .trim()
  .regex(/^[\x21-\x7e]+$/, {
    message: "value contains unsupported header characters",
  });

export const IdempotencyKeySchema = HeaderValueSchema.min(1).max(128);

const CampaignIdSchema = z
  .number()
  .int()
  .positive()
  .describe("Campaign ID from list_campaigns or create_campaign.");

const BulkEmailIdempotencyKeySchema = IdempotencyKeySchema.describe(
  "Stable retry key for this exact send attempt; reuse it when retrying the same user-approved action.",
);

const SendConfirmationSchema = z
  .literal("user_authorized")
  .describe('Required literal "user_authorized" after explicit user approval.');

const CampaignCreatorWorkflowFilterSchema = z.enum([
  "all",
  "email",
  "email_not_sent",
  "email_sent",
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
]);

const PositiveIdListSchema = z.array(z.number().int().positive()).min(1);

const CampaignCreatorSelectionSchema = z
  .object({
    workflow_filter: CampaignCreatorWorkflowFilterSchema.optional(),
    outreach_stage: z.string().trim().min(1).optional(),
    platform: z.enum(["tiktok", "instagram"]).optional(),
    country: z.string().trim().min(1).optional(),
    has_video: z.boolean().optional(),
    source_type: z
      .enum([
        "saved_list",
        "file_upload",
        "manual_add",
        "form_submission",
        "discovery_search",
      ])
      .optional(),
    search: z.string().trim().min(1).optional(),
    excluded_ids: z.array(z.number().int().positive()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasNarrowingFilter =
      (value.workflow_filter !== undefined &&
        value.workflow_filter !== "all") ||
      value.outreach_stage !== undefined ||
      value.platform !== undefined ||
      value.country !== undefined ||
      value.has_video !== undefined ||
      value.source_type !== undefined ||
      value.search !== undefined;

    if (!hasNarrowingFilter) {
      context.addIssue({
        code: "custom",
        message:
          "campaign_creator_selection must include a narrowing filter; use campaign_creator_ids for exact rows",
      });
    }
  });

export type CampaignCreatorSelectionInput = z.infer<
  typeof CampaignCreatorSelectionSchema
>;

const CampaignRecipientIdsTargetSchema = z
  .object({
    campaign_creator_ids: PositiveIdListSchema,
  })
  .strict();

const CampaignRecipientSelectionTargetSchema = z
  .object({
    campaign_creator_selection: CampaignCreatorSelectionSchema,
  })
  .strict();

const CampaignRecipientTargetSchema = z
  .union([
    z
      .object({
        type: z.literal("ids"),
        campaign_creator_ids: PositiveIdListSchema.describe(
          "Exact campaign creator row IDs selected from list_campaign_creators.",
        ),
      })
      .strict(),
    z
      .object({
        type: z.literal("selection"),
        campaign_creator_selection: CampaignCreatorSelectionSchema.describe(
          "Narrowed campaign roster selection, such as workflow_filter: email_not_sent.",
        ),
      })
      .strict(),
  ])
  .describe(
    'Recipient targeting mode: use {type:"ids"} with campaign_creator_ids for exact campaign creator rows, or {type:"selection"} with campaign_creator_selection for a narrowed campaign roster filter.',
  );

function validateFormLanguage(
  value: {
    readonly form_id?: number | undefined;
    readonly form_language?: "en" | "ko" | "jp" | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (value.form_language !== undefined && value.form_id === undefined) {
    context.addIssue({
      code: "custom",
      message: "form_id is required when form_language is provided",
      path: ["form_id"],
    });
  }
}

const CheckBulkEmailReadinessBaseSchema = z.object({
  campaign_id: CampaignIdSchema,
});

export const CheckBulkEmailReadinessInputSchema = z.union([
  CheckBulkEmailReadinessBaseSchema.merge(CampaignRecipientIdsTargetSchema),
  CheckBulkEmailReadinessBaseSchema.merge(
    CampaignRecipientSelectionTargetSchema,
  ),
]);

export const CheckBulkEmailReadinessDiscoveryInputSchema =
  CheckBulkEmailReadinessBaseSchema.extend({
    recipient_target: CampaignRecipientTargetSchema,
  }).strict();

const StartBulkEmailBaseSchema = z
  .object({
    campaign_id: CampaignIdSchema,
    subject: EmailSubjectSchema,
    body_text: z.string().trim().min(1),
    from_email: z.string().trim().min(1).optional(),
    attachments: z.array(z.string().trim().min(1)).optional(),
    form_id: z.number().int().positive().optional(),
    form_language: z.enum(["en", "ko", "jp"]).optional(),
    idempotency_key: BulkEmailIdempotencyKeySchema,
    send_confirmation: SendConfirmationSchema,
  })
  .strict();

export const StartBulkEmailInputSchema = z
  .union([
    StartBulkEmailBaseSchema.merge(CampaignRecipientIdsTargetSchema),
    StartBulkEmailBaseSchema.merge(CampaignRecipientSelectionTargetSchema),
  ])
  .superRefine(validateFormLanguage);

export const StartBulkEmailDiscoveryInputSchema =
  StartBulkEmailBaseSchema.extend({
    recipient_target: CampaignRecipientTargetSchema,
  })
    .strict()
    .superRefine(validateFormLanguage);

export type CheckBulkEmailReadinessInput = z.infer<
  typeof CheckBulkEmailReadinessInputSchema
>;

export type StartBulkEmailInput = z.infer<typeof StartBulkEmailInputSchema>;

type CheckBulkEmailReadinessDiscoveryInput = z.infer<
  typeof CheckBulkEmailReadinessDiscoveryInputSchema
>;

type StartBulkEmailDiscoveryInput = z.infer<
  typeof StartBulkEmailDiscoveryInputSchema
>;

/** Convert the MCP-discoverable recipient target into the Product API shape. */
export function normalizeCheckBulkEmailReadinessInput(
  input: CheckBulkEmailReadinessDiscoveryInput,
): CheckBulkEmailReadinessInput {
  if (input.recipient_target.type === "ids") {
    return {
      campaign_id: input.campaign_id,
      campaign_creator_ids: input.recipient_target.campaign_creator_ids,
    };
  }
  return {
    campaign_id: input.campaign_id,
    campaign_creator_selection:
      input.recipient_target.campaign_creator_selection,
  };
}

/** Convert the MCP-discoverable send target into the Product API shape. */
export function normalizeStartBulkEmailInput(
  input: StartBulkEmailDiscoveryInput,
): StartBulkEmailInput {
  const base = {
    campaign_id: input.campaign_id,
    subject: input.subject,
    body_text: input.body_text,
    from_email: input.from_email,
    attachments: input.attachments,
    form_id: input.form_id,
    form_language: input.form_language,
    idempotency_key: input.idempotency_key,
    send_confirmation: input.send_confirmation,
  };
  if (input.recipient_target.type === "ids") {
    return {
      ...base,
      campaign_creator_ids: input.recipient_target.campaign_creator_ids,
    };
  }
  return {
    ...base,
    campaign_creator_selection:
      input.recipient_target.campaign_creator_selection,
  };
}
