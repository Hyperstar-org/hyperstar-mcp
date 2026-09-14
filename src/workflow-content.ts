import type { JsonObject } from "./http.js";
import type { Surface } from "./surface.js";

export type WorkflowGuideKind =
  | "headless-workflow"
  | "search-to-campaign"
  | "bulk-email-safety"
  | "inbox"
  | "campaign-management"
  | "reporting"
  | "forms-and-files"
  | "imports-and-usage";

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
  "start_email_unlock and poll get_email_unlock_job when selected recipients are locked",
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
  "start_email_unlock and poll get_email_unlock_job when selected recipients are locked",
  "check_bulk_email_readiness",
  "WARNING: start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const CLI_SAFETY_NOTES = [
  "When no service-account API key is configured inside MCP, call start_browser_login and complete_browser_login instead of asking the user to run a separate CLI command.",
  "Run list_workspaces and select_workspace before Product API calls that require workspace scope.",
  "Run hyperstar_whoami after selecting a workspace to confirm the authenticated principal.",
  "Run list_campaigns or create_campaign before save_search_results_to_campaign when the user has not supplied a campaign_id.",
  "check_bulk_email_readiness is the final dry-run gate before any bulk send.",
  "start_email_unlock may charge credits and requires explicit cost confirmation plus a maximum charge bound.",
  "start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const SERVICE_ACCOUNT_SAFETY_NOTES = [
  "Service-account auth is already workspace-scoped; select_workspace is only for local browser CLI auth.",
  "Run list_workspaces and hyperstar_whoami before workflow tools to confirm the authenticated workspace.",
  "Run list_campaigns or create_campaign before save_search_results_to_campaign when the user has not supplied a campaign_id.",
  "check_bulk_email_readiness is the final dry-run gate before any bulk send.",
  "start_email_unlock may charge credits and requires explicit cost confirmation plus a maximum charge bound.",
  "start_bulk_email and send_inbox_reply perform real sends.",
] as const;

export const WORKFLOW_DATA_FLOW_NOTES = [
  "search_creators returns a search_id plus compact creator summaries; save_search_results_to_campaign consumes search_id server-side, so agents do not need to load every creator row into context.",
  "For YouTube, use kind=keyword and stable channel origin IDs; reference search, metric sorting, and campaign video tracking are unavailable.",
  "check_bulk_email_readiness and start_bulk_email require recipient_target, either exact campaign_creator_ids or a narrowed campaign_creator_selection.",
  "Use list_campaign_creators after saving search results to find campaign_creator_ids for explicit recipient_target calls.",
  "Use start_email_unlock for selected locked campaign creators, poll get_email_unlock_job, then re-run check_bulk_email_readiness.",
  'Use list_inbox_threads for triage, get_inbox_thread_messages to read full message history before drafting replies, update_inbox_thread_state for non-send state changes, and send_inbox_reply only after explicit user authorization with send_confirmation: "user_authorized".',
] as const;

export const HOSTED_WORKFLOW_SEQUENCE =
  SERVICE_ACCOUNT_WORKFLOW_SEQUENCE.slice(1);
export const HOSTED_SAFETY_NOTES = [
  "Your connector is bound to the workspace selected during consent. Call hyperstar_whoami to confirm it.",
  "To change workspace or restore revoked access, disconnect and reconnect through your app's connector settings.",
  ...SERVICE_ACCOUNT_SAFETY_NOTES.slice(2),
] as const;

export const SEARCH_FILTER_GUIDANCE = [
  "filters is a structured JSON object validated by the MCP before it is forwarded to Product API search.",
  "TikTok `has_recent_shop_videos: true` selects product links among the latest 12 stored videos (beta, incomplete coverage). False omits this constraint. Shop owners and business accounts can match; `has_tiktok_shop` and `commercial_user` remain independent. `is_sales` still means external sales metrics, not this video evidence.",
  'Use range objects such as `follower_range: {"min": 1000, "max": 100000}`, `avg_engagement_rate`, `avg_views`, `gmv`, and `gpm`.',
  "Use boolean/string filters such as `has_email`, `email_contactability`, `is_verified`, `has_tiktok_shop`, `creator_gender`, `creator_language`, `category_1`, and Instagram `category_name`.",
  "Put broad niches, verticals, and countries in `query`/`region` unless a named structured filter applies; do not invent `country`, `categories`, `follower_count`, or `engagement_rate` filter keys.",
  "Use recent_post_tags for exact latest-stored-post hashtag counts on TikTok/Instagram and tag_match_ratio to rank that cohort; gmv and gpm are TikTok-only.",
  "YouTube uses kind=keyword and supports region, follower_range, creator_language, and has_email only; do not send reference payloads or metric sorting.",
  "Keep filters narrow and serializable; use get_search_results pagination instead of loading every creator row into context.",
] as const;

export const workflowGuideResourceDefinitions = [
  {
    kind: "imports-and-usage",
    uri: "hyperstar://guide/imports-and-usage",
    name: "imports-and-usage",
    title: "Imports and usage — for agents",
    description: "Import CSV/XLSX creators and check credits without spending.",
  },
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
  {
    kind: "campaign-management",
    uri: "hyperstar://guide/campaign-management",
    name: "campaign-management",
    title: "Campaign Management",
    description:
      "Edit rosters, copy a fixed selection, and manage follow-up waves.",
  },
  {
    kind: "reporting",
    uri: "hyperstar://guide/reporting",
    name: "reporting",
    title: "Campaign Reporting",
    description: "Read bounded period performance and native-currency revenue.",
  },
  {
    kind: "forms-and-files",
    uri: "hyperstar://guide/forms-and-files",
    name: "forms-and-files",
    title: "Forms and Files",
    description:
      "Choose forms and transfer files through HTTP or the in-app handoff.",
  },
] as const satisfies readonly WorkflowGuideResourceDefinition[];

/** Return workflow guide data for the authenticated MCP mode. */
export function workflowGuideJson(
  authMode: "cli" | "service_account" | "hosted",
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
    sequence: [
      ...(authMode === "hosted"
        ? HOSTED_WORKFLOW_SEQUENCE
        : SERVICE_ACCOUNT_WORKFLOW_SEQUENCE),
    ],
    safety_notes: [
      ...(authMode === "hosted"
        ? HOSTED_SAFETY_NOTES
        : SERVICE_ACCOUNT_SAFETY_NOTES),
    ],
    data_flow_notes: [...WORKFLOW_DATA_FLOW_NOTES],
    resources: workflowGuideResourceDefinitions.map((resource) => resource.uri),
  };
}

/** Render one workflow guide as Markdown for MCP resources and prompts. */
export function buildWorkflowMarkdown(
  kind: WorkflowGuideKind,
  surface: Surface = "local",
): string {
  if (surface === "hosted" && kind === "headless-workflow") {
    return [
      "# Hyperstar Connector Workflow",
      "",
      orderedList(HOSTED_WORKFLOW_SEQUENCE),
      "",
      unorderedList(HOSTED_SAFETY_NOTES),
      "",
      "## Data Flow",
      unorderedList(WORKFLOW_DATA_FLOW_NOTES),
      "",
      "## Search Filters",
      unorderedList(SEARCH_FILTER_GUIDANCE),
    ].join("\n");
  }
  switch (kind) {
    case "campaign-management":
      return [
        "# Campaign management — for agents",
        "1. Confirm workspace/capabilities with hyperstar_whoami; get_campaign and list_campaign_creators provide settings and filtered, paginated rows.",
        "2. Use add_campaign_creator with a stable idempotency_key, or update_campaign_creator for explicit assignments. Roster IDs differ from catalog creator IDs.",
        "3. For all matching rows, prepare_campaign_creator_selection freezes at most 100 IDs for 30 minutes. Copy with a stable key; removal requires explicit approval and the successful source IDs from the copy result.",
        "4. Discover list_email_senders and list_campaign_email_waves before a follow-up. Readiness and start must use the same kind=follow_up, threading_policy=require_existing, parent wave and sender. Follow-ups are dev-only until provider threading verification passes.",
        "5. Cancel a confirmed wave to stop eligible pending work; delivered mail cannot be recalled. Retry only after fresh user authorization and with a stable key. Never infer that uncertain delivery failed.",
      ].join("\n");
    case "reporting":
      return [
        "# Campaign reporting — for agents",
        "1. Choose a campaign and an explicit timezone-aware start/end window (at most 180 days). get_campaign_performance reports (start, end] with separately labeled lifetime counters.",
        "2. Page list_campaign_creator_performance or list_campaign_video_performance; request get_campaign_video_history only for selected video IDs and day/week/month granularity.",
        "3. Preserve null period metrics when a baseline or observation is missing; report coverage and freshness. Do not substitute lifetime counters or creator-profile averages.",
        "4. get_campaign_revenue uses inclusive provider calendar dates. Request points/products only when needed, paginate products, and keep currencies/providers separate. Unconnected or unavailable revenue is not zero and provisional amounts are excluded.",
      ].join("\n");
    case "imports-and-usage":
      return [
        "# Spreadsheet imports and usage — for agents",
        "1. get_workspace_usage needs usage:read (reconnect or explicitly add the API-key permission). Balances are remaining credits/quota; capacity is occupied units. Expired stored balances are not spendable. Checks reserve nothing.",
        "2. Choose a campaign, then create_campaign_creator_import with a stable key and upload.mode=browser or direct. Browser returns an authenticated handoff_url. Direct requires filename, MIME, byte_size and base64 SHA-256; POST multipart fields exactly as returned, file part LAST. Never PUT this upload or send bytes/base64 in MCP JSON.",
        "3. CSV/XLSX only, 10 MiB, 100,000 logical data rows, 32 columns, 2,048 characters/cell. Headers: platform plus handle (username alias), creator_id or origin_id. Platforms: tiktok, instagram, youtube. Optional email, country, notes/memo, payment_method/payment, secondary_usage, draft_content_url, final_content_url, video_url/video_link. XLSX formulas are rejected. A minimal CSV header is: platform,handle,email,country,notes. Use real authorized creators; do not import the header as a data row.",
        "4. check_operation_capacity takes request.operation=spreadsheet_import and row_count excluding the header. All staged rows reserve upload_db quota; successful AND skipped rows are charged; errors/unprocessed rows are refunded. Optional video columns may require tracking capacity. The canonical parser and worker decide actual usage.",
        "5. After user approval, confirm_campaign_creator_import with user_authorized=true; the browser Import button performs this decision. Poll get_campaign_creator_import with the same explicit job/handoff reference. Back off 2/5/10 seconds, at most 12 polls per turn, then retain a resume reference. Cancel only unstarted/queued jobs. Replaying creation/binding keeps the same job; changed file requires a new key. Never reimport to obtain results.",
        "6. Terminal job completion is separate from result CSV availability. get_campaign_creator_import_results returns a download or pending/expired/not-requested/retry-exhausted outcome. Automatic retries can stop; retain accounting and issue samples, manually refresh later. Artifacts are retained seven days.",
        "7. Other checks: save_creators with count, create_campaign for one slot, email_unlock with target.type=count and count (upper bound), or target.type=campaign_creators, campaign_id and 1–500 unique campaign_creator_ids (also campaigns:read). IDs refer to roster rows, not global creator IDs.",
        "8. For unlock estimates show both estimated_units and authorization_maximum. After explicit approval, start_email_unlock uses the exact campaign/roster IDs and the approved authorization_maximum as max_chargeable_count. Never substitute the smaller paid estimate or silently raise the cap. Only zero authorization targets mean no unlock needed; free grant restoration can still need a confirmed action even when estimated_units=0. No estimate sends mail or reveals emails.",
      ].join("\n");
    case "forms-and-files":
      return [
        "# Forms and files — for agents",
        "1. list_forms/get_form discover usable IDs. Create with a stable key or edit an owned form; system defaults are read-only. form_language EN/KO/JP is selected when sending. Existing sent form snapshots remain unchanged.",
        "2. create_file_upload takes an explicit campaign target, file metadata and stable key. Contract or content replacement requires approval and the existing file target. Never send base64 or local file paths in MCP arguments.",
        "3. Upload the binary with HTTP PUT to the short-lived upload_url using exactly the returned headers, then complete_file_upload. If the client cannot PUT, give the user handoff_url; they must sign in as the same actor in the same workspace. Poll get_file_upload afterward.",
        "4. Refresh expired PUT instructions through get_file_upload while the transfer is pending. A cancelled/expired transfer needs a new key. Repeating completion returns the accepted result. Only a completed email attachment reference may be used for its intended campaign send, after explicit send approval.",
        "5. list_campaign_creator_files/get_campaign_file_download and get_message_attachment_download return authorized short-lived downloads. File completion preserves canonical contract/content stages; it does not register posted tracking content.",
      ].join("\n");
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
        '1. Call `search_creators` with the platform, region, query, filters, and limit. For YouTube use `kind: "keyword"`.',
        "",
        'Use structured filter keys such as `follower_range: {"min": 1000, "max": 100000}`, `avg_engagement_rate`, `avg_views`, `has_email`, `email_contactability`, `is_verified`, `creator_language`, `category_1`, Instagram `category_name`, `gmv`, `gpm`, and TikTok/Instagram `recent_post_tags`. Put broad niches and countries in `query`/`region`; do not invent `country`, `categories`, `follower_count`, or `engagement_rate` filter keys. `tag_match_ratio` requires `recent_post_tags`; `gmv` and `gpm` are TikTok-only.',
        "",
        "2. Read the returned `search_id` and compact creator summaries. Do not expect full profile payloads by default.",
        '3. Use `get_search_results` with `detail_level: "full"` only when a specific page of raw creator rows is explicitly needed.',
        "4. Use `list_campaigns` or `create_campaign` to choose a `campaign_id`.",
        "5. Call `save_search_results_to_campaign` with the `search_id`; the Product API imports server-side so the agent does not need to load every creator into context.",
        "6. Call `list_campaign_creators` to review the saved campaign roster.",
        "7. For a YouTube roster, unlock only catalog-backed email addresses before checking bulk-email readiness; never interpret `has_business_email` as an address.",
        "",
        "Search tools return compact creator summaries by default to preserve context and avoid exposing raw fields unnecessarily.",
      ].join("\n");
    case "bulk-email-safety":
      return [
        "# Bulk Email Safety",
        "",
        "1. Call `list_campaign_creators` for the target campaign.",
        "2. Call `check_bulk_email_readiness` with `recipient_target` set to exact campaign creator IDs or a narrowed selection filter.",
        "3. If selected recipients have locked catalog email, call `start_email_unlock` only after explicit cost confirmation and poll `get_email_unlock_job`, then repeat readiness.",
        "4. Proceed only when the user has authorized the send and `sendable` is greater than zero.",
        '5. Call `start_bulk_email` with an explicit `idempotency_key` and `send_confirmation: "user_authorized"`. start_bulk_email performs a real send.',
        "6. Poll `get_bulk_email_job` with the returned `job_id` before taking follow-up action.",
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
