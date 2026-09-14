import type { JsonObject } from "./http.js";
import { campaignCreatorSelectionBody } from "./campaign-creator-selection.js";
import { compactJsonObject } from "./tool-http-helpers.js";
import type {
  CheckBulkEmailReadinessInput,
  StartBulkEmailInput,
} from "./tool-inputs.js";

/** Build the campaign bulk-email readiness request body. */
export function readinessRequestBody(
  input: CheckBulkEmailReadinessInput,
): JsonObject {
  return {
    ...campaignRecipientTargetBody(input),
    ...compactJsonObject([
      ["email_account_id", input.email_account_id],
      ["kind", input.kind],
      ["threading", input.threading],
      ["requested_parent_wave_id", input.requested_parent_wave_id],
    ]),
  };
}

/** Build the campaign bulk-email job request body. */
export function startBulkEmailRequestBody(
  input: StartBulkEmailInput,
): JsonObject {
  return compactJsonObject([
    ["subject", input.subject],
    ["body_text", input.body_text],
    ["from_email", input.from_email],
    ["email_account_id", input.email_account_id],
    ["kind", input.kind],
    ["threading", input.threading],
    ["requested_parent_wave_id", input.requested_parent_wave_id],
    ["attachments", input.attachments],
    ...campaignRecipientTargetEntries(input),
    ["form_id", input.form_id],
    ["form_language", input.form_language],
    ["idempotency_key", input.idempotency_key],
    ["send_confirmation", input.send_confirmation],
  ]);
}

function campaignRecipientTargetBody(
  input: CheckBulkEmailReadinessInput | StartBulkEmailInput,
): JsonObject {
  return compactJsonObject(campaignRecipientTargetEntries(input));
}

function campaignRecipientTargetEntries(
  input: CheckBulkEmailReadinessInput | StartBulkEmailInput,
) {
  return [
    [
      "campaign_creator_ids",
      "campaign_creator_ids" in input ? input.campaign_creator_ids : undefined,
    ],
    [
      "campaign_creator_selection",
      campaignCreatorSelectionBody(
        "campaign_creator_selection" in input
          ? input.campaign_creator_selection
          : undefined,
      ),
    ],
  ] as const;
}
