import type { JsonObject } from "./http.js";

export type WorkflowGuideKind =
  "headless-workflow" | "search-to-campaign" | "bulk-email-safety" | "inbox";

export type WorkflowGuideResourceDefinition = {
  readonly kind: WorkflowGuideKind;
  readonly uri: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
};

export const CLI_WORKFLOW_SEQUENCE = [
  "list_workspaces",
  "select_workspace",
  "hyperstar_whoami",
  "search_creators",
  "list_campaigns or create_campaign",
  "save_search_results_to_campaign",
  "list_campaign_creators",
  "check_bulk_email_readiness",
  "WARNING: start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const BROWSER_LOGIN_WORKFLOW_SEQUENCE = [
  "start_browser_login",
  "complete_browser_login",
  ...CLI_WORKFLOW_SEQUENCE,
] as const;

export const SERVICE_ACCOUNT_WORKFLOW_SEQUENCE = [
  "list_workspaces",
  "hyperstar_whoami",
  "search_creators",
  "list_campaigns or create_campaign",
  "save_search_results_to_campaign",
  "list_campaign_creators",
  "check_bulk_email_readiness",
  "WARNING: start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const CLI_SAFETY_NOTES = [
  "When no service-account API key is configured inside MCP, call start_browser_login and complete_browser_login instead of asking the user to run a separate CLI command.",
  "Run list_workspaces and select_workspace before Product API calls that require workspace scope.",
  "Run hyperstar_whoami after selecting a workspace to confirm the authenticated principal.",
  "Run list_campaigns or create_campaign before save_search_results_to_campaign when the user has not supplied a campaign_id.",
  "check_bulk_email_readiness is the final dry-run gate before any bulk send.",
  "start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const SERVICE_ACCOUNT_SAFETY_NOTES = [
  "Service-account auth is already workspace-scoped; select_workspace is only for local browser CLI auth.",
  "Run list_workspaces and hyperstar_whoami before workflow tools to confirm the authenticated workspace.",
  "Run list_campaigns or create_campaign before save_search_results_to_campaign when the user has not supplied a campaign_id.",
  "check_bulk_email_readiness is the final dry-run gate before any bulk send.",
  "start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const WORKFLOW_DATA_FLOW_NOTES = [
  "search_creators returns a search_id plus compact creator summaries; save_search_results_to_campaign consumes search_id server-side, so agents do not need to load every creator row into context.",
  "check_bulk_email_readiness and start_bulk_email require recipient_target, either exact campaign_creator_ids or a narrowed campaign_creator_selection.",
  "Use list_campaign_creators after saving search results to find campaign_creator_ids for explicit recipient_target calls.",
  'Use list_inbox_threads for triage, get_inbox_thread_messages to read full message history before drafting replies, update_inbox_thread_state for non-send state changes, and send_inbox_reply only after explicit user authorization with send_confirmation: "user_authorized".',
] as const;

export const SEARCH_FILTER_GUIDANCE = [
  "filters is a structured JSON object validated by the MCP before it is forwarded to Product API search.",
  'Use range objects such as `follower_range: {"min": 1000, "max": 100000}`, `avg_engagement_rate`, `avg_views`, `gmv`, and `gpm`.',
  "Use boolean/string filters such as `has_email`, `email_contactability`, `is_verified`, `has_tiktok_shop`, `creator_gender`, `creator_language`, `category_1`, and Instagram `category_name`.",
  "Put broad niches, verticals, and countries in `query`/`region` unless a named structured filter applies; do not invent `country`, `categories`, `follower_count`, or `engagement_rate` filter keys.",
  "Use sort_by for relevance, follower_count, engagement_rate, avg_views, views_growth_rate, gmv, or gpm; gmv and gpm are TikTok-only.",
  "Keep filters narrow and serializable; use get_search_results pagination instead of loading every creator row into context.",
] as const;

export const workflowGuideResourceDefinitions = [
  {
    kind: "headless-workflow",
    uri: "hyperstar://guide/headless-workflow",
    name: "headless-workflow",
    title: "Hyperstar Headless Workflow",
    description: "Canonical agent workflow for using Hyperstar without UI.",
  },
  {
    kind: "search-to-campaign",
    uri: "hyperstar://guide/search-to-campaign",
    name: "search-to-campaign",
    title: "Search To Campaign",
    description:
      "How to search creators and save selected results to a campaign.",
  },
  {
    kind: "bulk-email-safety",
    uri: "hyperstar://guide/bulk-email-safety",
    name: "bulk-email-safety",
    title: "Bulk Email Safety",
    description:
      "Required checks before starting any Hyperstar bulk-email job.",
  },
  {
    kind: "inbox",
    uri: "hyperstar://guide/inbox",
    name: "inbox",
    title: "Inbox Workflow",
    description: "How to read, triage, and reply to Hyperstar inbox threads.",
  },
] as const satisfies readonly WorkflowGuideResourceDefinition[];

/** Return workflow guide data for the authenticated MCP mode. */
export function workflowGuideJson(
  authMode: "cli" | "service_account",
): JsonObject {
  if (authMode === "cli") {
    return {
      sequence: [...CLI_WORKFLOW_SEQUENCE],
      safety_notes: [...CLI_SAFETY_NOTES],
      data_flow_notes: [...WORKFLOW_DATA_FLOW_NOTES],
      resources: workflowGuideResourceDefinitions.map(
        (resource) => resource.uri,
      ),
    };
  }
  return {
    sequence: [...SERVICE_ACCOUNT_WORKFLOW_SEQUENCE],
    safety_notes: [...SERVICE_ACCOUNT_SAFETY_NOTES],
    data_flow_notes: [...WORKFLOW_DATA_FLOW_NOTES],
    resources: workflowGuideResourceDefinitions.map((resource) => resource.uri),
  };
}

/** Render one workflow guide as Markdown for MCP resources and prompts. */
export function buildWorkflowMarkdown(kind: WorkflowGuideKind): string {
  switch (kind) {
    case "headless-workflow":
      return [
        "# Hyperstar Headless Workflow",
        "",
        "Use these tools in order when the user wants creator discovery, campaign saving, outreach, and inbox follow-up without opening the dashboard.",
        "",
        "## Service-account flow",
        orderedList(SERVICE_ACCOUNT_WORKFLOW_SEQUENCE),
        "",
        "## Local browser flow",
        orderedList(BROWSER_LOGIN_WORKFLOW_SEQUENCE),
        "",
        "Always confirm workspace and scopes with `hyperstar_whoami` before mutating campaigns, sending bulk email, or replying in the inbox.",
        "",
        "## Data Flow",
        unorderedList(WORKFLOW_DATA_FLOW_NOTES),
        "",
        "## Search Filters",
        unorderedList(SEARCH_FILTER_GUIDANCE),
      ].join("\n");
    case "search-to-campaign":
      return [
        "# Search To Campaign",
        "",
        "1. Call `search_creators` with the platform, region, query, filters, and limit.",
        "",
        'Use structured filter keys such as `follower_range: {"min": 1000, "max": 100000}`, `avg_engagement_rate`, `avg_views`, `has_email`, `email_contactability`, `is_verified`, `creator_language`, `category_1`, Instagram `category_name`, `gmv`, and `gpm`. Put broad niches and countries in `query`/`region`; do not invent `country`, `categories`, `follower_count`, or `engagement_rate` filter keys. Use `sort_by` for `relevance`, `follower_count`, `engagement_rate`, `avg_views`, `views_growth_rate`, `gmv`, or `gpm`; `gmv` and `gpm` are TikTok-only.',
        "",
        "2. Read the returned `search_id` and compact creator summaries. Do not expect full profile payloads by default.",
        '3. Use `get_search_results` with `detail_level: "full"` only when a specific page of raw creator rows is explicitly needed.',
        "4. Use `list_campaigns` or `create_campaign` to choose a `campaign_id`.",
        "5. Call `save_search_results_to_campaign` with the `search_id`; the Product API imports server-side so the agent does not need to load every creator into context.",
        "6. Call `list_campaign_creators` to review the saved campaign roster.",
        "",
        "Search tools return compact creator summaries by default to preserve context and avoid exposing raw fields unnecessarily.",
      ].join("\n");
    case "bulk-email-safety":
      return [
        "# Bulk Email Safety",
        "",
        "1. Call `list_campaign_creators` for the target campaign.",
        "2. Call `check_bulk_email_readiness` with `recipient_target` set to exact campaign creator IDs or a narrowed selection filter.",
        "3. Proceed only when the user has authorized the send and `sendable` is greater than zero.",
        '4. Call `start_bulk_email` with an explicit `idempotency_key` and `send_confirmation: "user_authorized"`. start_bulk_email performs a real send.',
        "5. Poll `get_bulk_email_job` with the returned `job_id` before taking follow-up action.",
        "",
        "`send_inbox_reply` also performs a real send. Keep warnings visible at the point of action.",
      ].join("\n");
    case "inbox":
      return [
        "# Inbox Workflow",
        "",
        "1. Call `list_inbox_threads` with filters such as platform, unread state, archive state, search text, or campaign/job identifiers.",
        "2. Call `get_inbox_thread_messages` before drafting replies; thread lists contain summaries and previews, not full message history.",
        "3. Call `get_inbox_aggregates` when the user asks for counts by common inbox filters.",
        "4. Use `update_inbox_thread_state` for archive, star, snooze, or read-state changes.",
        '5. Use `send_inbox_reply` only when the user has authorized a real reply. Include a stable `idempotency_key` and `send_confirmation: "user_authorized"`.',
      ].join("\n");
  }
}

function orderedList(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function unorderedList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
