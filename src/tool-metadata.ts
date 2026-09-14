import {
  IMPORT_USAGE_METADATA,
  IMPORT_USAGE_ORDER,
} from "./import-usage-metadata.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import { TOOL_DESCRIPTIONS } from "./tool-descriptions.js";

type HyperstarToolMetadata = {
  readonly title: string;
  readonly description: string;
  readonly annotations: ToolAnnotations & { readonly title: string };
};

import {
  annotations,
  READ_ONLY,
  WRITE,
  DESTRUCTIVE,
} from "./tool-annotations.js";
import {
  EXPANDED_TOOL_METADATA,
  EXPANDED_TOOL_ORDER,
} from "./expanded-tool-metadata.js";

/** Shared Hyperstar MCP tool metadata for runtime and MCPB manifests. */
export const HYPERSTAR_TOOL_METADATA = {
  ...EXPANDED_TOOL_METADATA,
  ...IMPORT_USAGE_METADATA,
  start_browser_login: {
    title: "Start Browser Login",
    description: TOOL_DESCRIPTIONS.startBrowserLogin,
    annotations: annotations("Start Browser Login", WRITE),
  },
  complete_browser_login: {
    title: "Complete Browser Login",
    description: TOOL_DESCRIPTIONS.completeBrowserLogin,
    annotations: annotations("Complete Browser Login", WRITE),
  },
  hyperstar_whoami: {
    title: "Hyperstar Whoami",
    description: TOOL_DESCRIPTIONS.hyperstarWhoami,
    annotations: annotations("Hyperstar Whoami", READ_ONLY),
  },
  list_workspaces: {
    title: "List Workspaces",
    description: TOOL_DESCRIPTIONS.listWorkspaces,
    annotations: annotations("List Workspaces", READ_ONLY),
  },
  select_workspace: {
    title: "Select Workspace",
    description: TOOL_DESCRIPTIONS.selectWorkspace,
    annotations: annotations("Select Workspace", WRITE),
  },
  get_hyperstar_workflow_guide: {
    title: "Get Hyperstar Workflow Guide",
    description: TOOL_DESCRIPTIONS.workflowGuide,
    annotations: annotations("Get Hyperstar Workflow Guide", READ_ONLY),
  },
  search_creators: {
    title: "Search Creators",
    description: TOOL_DESCRIPTIONS.searchCreators,
    annotations: annotations("Search Creators", WRITE),
  },
  get_search_results: {
    title: "Get Search Results",
    description: TOOL_DESCRIPTIONS.getSearchResults,
    annotations: annotations("Get Search Results", READ_ONLY),
  },
  list_campaigns: {
    title: "List Campaigns",
    description: TOOL_DESCRIPTIONS.listCampaigns,
    annotations: annotations("List Campaigns", READ_ONLY),
  },
  create_campaign: {
    title: "Create Campaign",
    description: TOOL_DESCRIPTIONS.createCampaign,
    annotations: annotations("Create Campaign", WRITE),
  },
  save_search_results_to_campaign: {
    title: "Save Search Results To Campaign",
    description: TOOL_DESCRIPTIONS.saveSearchResultsToCampaign,
    annotations: annotations("Save Search Results To Campaign", WRITE),
  },
  list_campaign_creators: {
    title: "List Campaign Creators",
    description: TOOL_DESCRIPTIONS.listCampaignCreators,
    annotations: annotations("List Campaign Creators", READ_ONLY),
  },
  start_email_unlock: {
    title: "Start Email Unlock",
    description: TOOL_DESCRIPTIONS.startEmailUnlock,
    annotations: annotations("Start Email Unlock", DESTRUCTIVE),
  },
  get_email_unlock_job: {
    title: "Get Email Unlock Job",
    description: TOOL_DESCRIPTIONS.getEmailUnlockJob,
    annotations: annotations("Get Email Unlock Job", READ_ONLY),
  },
  check_bulk_email_readiness: {
    title: "Check Bulk Email Readiness",
    description: TOOL_DESCRIPTIONS.checkBulkEmailReadiness,
    annotations: annotations("Check Bulk Email Readiness", READ_ONLY),
  },
  start_bulk_email: {
    title: "Start Bulk Email",
    description: TOOL_DESCRIPTIONS.startBulkEmail,
    annotations: annotations("Start Bulk Email", DESTRUCTIVE),
  },
  get_bulk_email_job: {
    title: "Get Bulk Email Job",
    description: TOOL_DESCRIPTIONS.getBulkEmailJob,
    annotations: annotations("Get Bulk Email Job", READ_ONLY),
  },
  list_inbox_threads: {
    title: "List Inbox Threads",
    description: TOOL_DESCRIPTIONS.listInboxThreads,
    annotations: annotations("List Inbox Threads", READ_ONLY),
  },
  get_inbox_thread_messages: {
    title: "Get Inbox Thread Messages",
    description: TOOL_DESCRIPTIONS.getInboxThreadMessages,
    annotations: annotations("Get Inbox Thread Messages", READ_ONLY),
  },
  get_inbox_aggregates: {
    title: "Get Inbox Aggregates",
    description: TOOL_DESCRIPTIONS.getInboxAggregates,
    annotations: annotations("Get Inbox Aggregates", READ_ONLY),
  },
  update_inbox_thread_state: {
    title: "Update Inbox Thread State",
    description: TOOL_DESCRIPTIONS.updateInboxThreadState,
    annotations: annotations("Update Inbox Thread State", WRITE),
  },
  send_inbox_reply: {
    title: "Send Inbox Reply",
    description: TOOL_DESCRIPTIONS.sendInboxReply,
    annotations: annotations("Send Inbox Reply", DESTRUCTIVE),
  },
} as const satisfies Record<string, HyperstarToolMetadata>;

export type HyperstarToolName = keyof typeof HYPERSTAR_TOOL_METADATA;

/** Ordered tool names for generated MCPB manifests and docs. */
export const HYPERSTAR_TOOL_ORDER = [
  "start_browser_login",
  "complete_browser_login",
  "hyperstar_whoami",
  "list_workspaces",
  "select_workspace",
  "get_hyperstar_workflow_guide",
  "search_creators",
  "get_search_results",
  "list_campaigns",
  "create_campaign",
  "save_search_results_to_campaign",
  "list_campaign_creators",
  "check_bulk_email_readiness",
  "start_email_unlock",
  "get_email_unlock_job",
  "start_bulk_email",
  "get_bulk_email_job",
  "list_inbox_threads",
  "get_inbox_thread_messages",
  "get_inbox_aggregates",
  "update_inbox_thread_state",
  "send_inbox_reply",
  ...EXPANDED_TOOL_ORDER,
  ...IMPORT_USAGE_ORDER,
] as const satisfies readonly HyperstarToolName[];

/** Return runtime metadata for a registered Hyperstar tool. */
export function toolMetadata(name: HyperstarToolName): HyperstarToolMetadata {
  return HYPERSTAR_TOOL_METADATA[name];
}
