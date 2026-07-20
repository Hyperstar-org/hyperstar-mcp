import type { JsonObject } from "./http.js";
import { compactJsonObject } from "./tool-http-helpers.js";

type CampaignCreatorSelection = {
  readonly workflow_filter?: string | undefined;
  readonly outreach_stage?: string | undefined;
  readonly platform?: string | undefined;
  readonly country?: string | undefined;
  readonly has_video?: boolean | undefined;
  readonly source_type?: string | undefined;
  readonly search?: string | undefined;
  readonly excluded_ids?: readonly number[] | undefined;
};

/** Serialize campaign recipient selection without optional undefined fields. */
export function campaignCreatorSelectionBody(
  selection: CampaignCreatorSelection | undefined,
): JsonObject | undefined {
  if (selection === undefined) {
    return undefined;
  }
  return compactJsonObject([
    ["workflow_filter", selection.workflow_filter],
    ["outreach_stage", selection.outreach_stage],
    ["platform", selection.platform],
    ["country", selection.country],
    ["has_video", selection.has_video],
    ["source_type", selection.source_type],
    ["search", selection.search],
    ["excluded_ids", selection.excluded_ids],
  ]);
}
