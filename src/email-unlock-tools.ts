import type { HyperstarClient, JsonObject } from "./http.js";
import { compactJsonObject, pathSegment } from "./tool-http-helpers.js";
import { JsonObjectSchema } from "./schemas.js";
import {
  EmailUnlockJobInputSchema,
  StartEmailUnlockInputSchema,
} from "./tool-inputs.js";

/** Start a bounded, explicitly confirmed campaign email-unlock job. */
export async function startEmailUnlock(
  client: HyperstarClient,
  input: unknown,
) {
  const parsedInput = StartEmailUnlockInputSchema.parse(input);
  const selection =
    parsedInput.recipient_target.type === "selection"
      ? parsedInput.recipient_target.campaign_creator_selection
      : undefined;
  const target: JsonObject =
    parsedInput.recipient_target.type === "ids"
      ? {
          type: "campaign",
          campaign_id: parsedInput.campaign_id,
          campaign_creator_ids:
            parsedInput.recipient_target.campaign_creator_ids,
        }
      : compactJsonObject([
          ["type", "campaign"],
          ["campaign_id", parsedInput.campaign_id],
          [
            "campaign_creator_selection",
            compactJsonObject([
              ["workflow_filter", selection?.workflow_filter],
              ["outreach_stage", selection?.outreach_stage],
              ["platform", selection?.platform],
              ["country", selection?.country],
              ["has_video", selection?.has_video],
              ["source_type", selection?.source_type],
              ["search", selection?.search],
              ["excluded_creator_ids", selection?.excluded_ids],
            ]),
          ],
        ]);
  return JsonObjectSchema.parse(
    await client.post("/v1/email-unlocks/bulk-actions", {
      target,
      confirm_cost: parsedInput.confirm_cost,
      maximum_chargeable_unlocks: parsedInput.maximum_chargeable_unlocks,
      idempotency_key: parsedInput.idempotency_key,
    }),
  );
}

/** Read the durable state of an email-unlock job. */
export async function getEmailUnlockJob(
  client: HyperstarClient,
  input: unknown,
) {
  const parsedInput = EmailUnlockJobInputSchema.parse(input);
  return JsonObjectSchema.parse(
    await client.get(
      `/v1/email-unlocks/bulk-actions/${pathSegment(parsedInput.job_id)}`,
    ),
  );
}
