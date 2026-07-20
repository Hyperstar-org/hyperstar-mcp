import type { JsonObject, JsonValue } from "./http.js";
import { campaignCreatorSelectionBody } from "./campaign-creator-selection.js";
import type {
  CampaignCreatorSelectionInput,
  CheckBulkEmailReadinessInput,
} from "./tool-inputs.js";
import { compactJsonObject } from "./tool-http-helpers.js";

/** Add next-step guidance after creator search. */
export function searchGuidance(page: JsonObject): JsonObject {
  return {
    ...page,
    next_tools: [
      "list_campaigns",
      "create_campaign",
      "save_search_results_to_campaign",
    ],
    agent_guidance:
      "Use list_campaigns or create_campaign to choose a campaign_id. If the user already supplied a campaign_id, call save_search_results_to_campaign with this search_id; do not load every creator into context.",
  };
}

/** Add deterministic next-step guidance after campaign import. */
export function campaignImportGuidance(
  payload: JsonObject,
  campaignId: number,
): JsonObject {
  return {
    ...payload,
    next_tool: "list_campaign_creators",
    next_arguments: { campaign_id: campaignId },
    agent_guidance:
      "Search results were saved server-side. Call list_campaign_creators to inspect the campaign roster before outreach.",
  };
}

/** Add deterministic next-step guidance after listing campaign creators. */
export function campaignRosterGuidance(
  payload: JsonObject,
  campaignId: number,
): JsonObject {
  return {
    ...payload,
    next_tool: "check_bulk_email_readiness",
    next_arguments: { campaign_id: campaignId },
    next_required_arguments: ["recipient_target"],
    agent_guidance:
      "Before any bulk email, call check_bulk_email_readiness with recipient_target set to exact campaign creator IDs or a narrowed selection filter.",
  };
}

/** Add send or no-send guidance after the readiness dry run. */
export function readinessGuidance(
  payload: JsonObject,
  input: CheckBulkEmailReadinessInput,
): JsonObject {
  const sendable = numberValue(payload.sendable);
  const campaignCreatorIds =
    "campaign_creator_ids" in input ? input.campaign_creator_ids : undefined;
  const campaignCreatorSelection =
    "campaign_creator_selection" in input
      ? input.campaign_creator_selection
      : undefined;
  if (sendable === undefined || sendable <= 0) {
    return {
      ...payload,
      agent_guidance:
        "Do not call start_bulk_email: no selected recipients are currently sendable. Adjust the campaign roster or recipient selection, then run check_bulk_email_readiness again.",
    };
  }

  return {
    ...payload,
    next_tool: "start_bulk_email",
    next_arguments: compactJsonObject([
      ["campaign_id", input.campaign_id],
      [
        "recipient_target",
        recipientTargetArgument(campaignCreatorIds, campaignCreatorSelection),
      ],
    ]),
    next_required_arguments: [
      "subject",
      "body_text",
      "idempotency_key",
      "send_confirmation",
    ],
    agent_guidance:
      'Readiness passed. start_bulk_email performs a real send, so only call it after user authorization and after filling subject, body_text, a stable idempotency_key, and send_confirmation: "user_authorized".',
  };
}

/** Add deterministic next-step guidance after listing inbox threads. */
export function inboxThreadListGuidance(payload: JsonObject): JsonObject {
  return {
    ...payload,
    next_tools: [
      "get_inbox_thread_messages",
      "get_inbox_aggregates",
      "update_inbox_thread_state",
    ],
    agent_guidance:
      "Use get_inbox_thread_messages to read full message history before replying, get_inbox_aggregates for counts, update_inbox_thread_state for archive/star/snooze/read-state changes, and send_inbox_reply only after explicit user authorization because send_inbox_reply performs a real send.",
  };
}

/** Add deterministic next-step guidance after reading full inbox messages. */
export function inboxThreadMessagesGuidance(payload: JsonObject): JsonObject {
  return {
    ...payload,
    next_tools: ["send_inbox_reply", "update_inbox_thread_state"],
    agent_guidance:
      'Review the full message history before drafting. send_inbox_reply performs a real send and requires send_confirmation: "user_authorized".',
  };
}

function recipientTargetArgument(
  ids: readonly number[] | undefined,
  selection: CampaignCreatorSelectionInput | undefined,
): JsonObject {
  if (ids !== undefined) {
    return { type: "ids", campaign_creator_ids: [...ids] };
  }
  return {
    type: "selection",
    campaign_creator_selection: selectionBody(selection) ?? {},
  };
}

function selectionBody(
  selection: CampaignCreatorSelectionInput | undefined,
): JsonObject | undefined {
  return campaignCreatorSelectionBody(selection);
}

function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
