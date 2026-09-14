import type { HyperstarToolName } from "./tool-metadata.js";

export type Surface = "local" | "hosted";

export const HOSTED_TOOL_POLICY = {
  create_campaign_creator_import: true,
  confirm_campaign_creator_import: true,
  get_campaign_creator_import: true,
  get_campaign_creator_import_results: true,
  cancel_campaign_creator_import: true,
  get_workspace_usage: true,
  check_operation_capacity: true,

  create_file_upload: true,
  get_file_upload: true,
  complete_file_upload: true,
  cancel_file_upload: true,
  get_message_attachment_download: true,
  list_campaign_creator_files: true,
  get_campaign_file_download: true,
  remove_campaign_file: true,

  get_creator: true,
  list_forms: true,
  get_form: true,
  create_form: true,
  update_form: true,
  delete_form: true,

  list_email_senders: true,
  list_campaign_email_waves: true,
  get_campaign_email_wave: true,
  cancel_campaign_email_wave: true,
  retry_campaign_email_wave: true,

  get_campaign_revenue: true,
  get_campaign_performance: true,
  list_campaign_video_performance: true,
  list_campaign_creator_performance: true,
  get_campaign_video_history: true,

  prepare_campaign_creator_selection: true,
  copy_campaign_creators: true,
  remove_campaign_creators: true,

  get_campaign: true,
  update_campaign: true,
  get_campaign_workflow_counts: true,
  add_campaign_creator: true,
  update_campaign_creator: true,

  start_browser_login: false,
  complete_browser_login: false,
  hyperstar_whoami: true,
  list_workspaces: false,
  select_workspace: false,
  get_hyperstar_workflow_guide: true,
  search_creators: true,
  get_search_results: true,
  list_campaigns: true,
  create_campaign: true,
  save_search_results_to_campaign: true,
  list_campaign_creators: true,
  start_email_unlock: true,
  get_email_unlock_job: true,
  check_bulk_email_readiness: true,
  start_bulk_email: true,
  get_bulk_email_job: true,
  list_inbox_threads: true,
  get_inbox_thread_messages: true,
  get_inbox_aggregates: true,
  update_inbox_thread_state: true,
  send_inbox_reply: true,
} as const satisfies Record<HyperstarToolName, boolean>;

export type HostedToolName = {
  [Name in HyperstarToolName]: (typeof HOSTED_TOOL_POLICY)[Name] extends true
    ? Name
    : never;
}[HyperstarToolName];

export function isHostedTool(name: string): name is HostedToolName {
  return Object.entries(HOSTED_TOOL_POLICY).some(
    ([key, included]) => key === name && included,
  );
}
