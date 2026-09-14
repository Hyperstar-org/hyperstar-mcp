import {
  annotations,
  READ_ONLY,
  WRITE,
  DESTRUCTIVE,
} from "./tool-annotations.js";

export const EXPANDED_TOOL_METADATA = {
  create_file_upload: {
    title: "Create File Upload",
    description:
      "Prepare an actor-bound email attachment, contract or draft/final upload. Return direct PUT instructions and an authenticated browser handoff.",
    annotations: annotations("Create File Upload", WRITE),
  },
  get_file_upload: {
    title: "Get File Upload",
    description:
      "Read upload status or refresh pending transfer instructions for the same actor and workspace.",
    annotations: annotations("Get File Upload", READ_ONLY),
  },
  complete_file_upload: {
    title: "Complete File Upload",
    description:
      "Verify uploaded object metadata and accept it once. Repeat completion returns the same result.",
    annotations: annotations("Complete File Upload", WRITE),
  },
  cancel_file_upload: {
    title: "Cancel File Upload",
    description:
      "Cancel an explicitly approved pending upload. Completed campaign files use their removal tool.",
    annotations: annotations("Cancel File Upload", DESTRUCTIVE),
  },
  get_message_attachment_download: {
    title: "Get Message Attachment Download",
    description:
      "Authorize one inbox attachment and return a short-lived download URL.",
    annotations: annotations("Get Message Attachment Download", READ_ONLY),
  },
  list_campaign_creator_files: {
    title: "List Campaign Creator Files",
    description:
      "Read contract and draft/final review file metadata for one creator.",
    annotations: annotations("List Campaign Creator Files", READ_ONLY),
  },
  get_campaign_file_download: {
    title: "Get Campaign File Download",
    description:
      "Return a short-lived authorized download for a contract or selected draft/final file.",
    annotations: annotations("Get Campaign File Download", READ_ONLY),
  },
  remove_campaign_file: {
    title: "Remove Campaign File",
    description:
      "Remove an explicitly approved contract or exact draft/final file from its campaign creator.",
    annotations: annotations("Remove Campaign File", DESTRUCTIVE),
  },
  get_creator: {
    title: "Get Creator",
    description:
      "Read a known creator by a stable ID or username. Recent content is optional and bounded.",
    annotations: annotations("Get Creator", READ_ONLY),
  },
  list_forms: {
    title: "List Forms",
    description: "List available system and workspace forms for a send.",
    annotations: annotations("List Forms", READ_ONLY),
  },
  get_form: {
    title: "Get Form",
    description: "Read one form template and its editable fields.",
    annotations: annotations("Get Form", READ_ONLY),
  },
  create_form: {
    title: "Create Form",
    description:
      "Create a workspace form with a stable retry key. Use explicit localized text for the creator audience.",
    annotations: annotations("Create Form", WRITE),
  },
  update_form: {
    title: "Update Form",
    description:
      "Replace a workspace form configuration. Sent links retain immutable snapshots.",
    annotations: annotations("Update Form", WRITE),
  },
  delete_form: {
    title: "Delete Form",
    description:
      "Delete an explicitly approved workspace form from future selection. System defaults remain protected.",
    annotations: annotations("Delete Form", DESTRUCTIVE),
  },
  list_email_senders: {
    title: "List Email Senders",
    description:
      "Read send-eligible connected account IDs and addresses; provider credentials are never returned.",
    annotations: annotations("List Email Senders", READ_ONLY),
  },
  list_campaign_email_waves: {
    title: "List Campaign Email Waves",
    description:
      "Read bounded active/recent campaign email waves and delivery state counts.",
    annotations: annotations("List Campaign Email Waves", READ_ONLY),
  },
  get_campaign_email_wave: {
    title: "Get Campaign Email Wave",
    description:
      "Read one campaign email wave, including delivery uncertainty and cancellation availability.",
    annotations: annotations("Get Campaign Email Wave", READ_ONLY),
  },
  cancel_campaign_email_wave: {
    title: "Cancel Campaign Email Wave",
    description:
      "Stop eligible pending sends in an explicitly approved wave. This cannot recall delivered mail.",
    annotations: annotations("Cancel Campaign Email Wave", DESTRUCTIVE),
  },
  retry_campaign_email_wave: {
    title: "Retry Campaign Email Wave",
    description:
      "Send again only to backend-eligible failures after fresh user approval. Successful and uncertain recipients are never automatically resent.",
    annotations: annotations("Retry Campaign Email Wave", DESTRUCTIVE),
  },

  get_campaign_revenue: {
    title: "Get Campaign Revenue",
    description:
      "Read bounded finalized campaign revenue by provider and native currency. Details and products are opt-in.",
    annotations: annotations("Get Campaign Revenue", READ_ONLY),
  },
  get_campaign_performance: {
    title: "Get Campaign Performance",
    description:
      "Read campaign totals for an explicit UTC window, with lifetime metrics and missing-history coverage separately labeled.",
    annotations: annotations("Get Campaign Performance", READ_ONLY),
  },
  list_campaign_video_performance: {
    title: "List Campaign Video Performance",
    description:
      "Rank tracked videos by observed period metrics. Follow next_offset for more results.",
    annotations: annotations("List Campaign Video Performance", READ_ONLY),
  },
  list_campaign_creator_performance: {
    title: "List Campaign Creator Performance",
    description:
      "Rank campaign creators by tracked-video period metrics. These are campaign metrics, not creator profile statistics.",
    annotations: annotations("List Campaign Creator Performance", READ_ONLY),
  },
  get_campaign_video_history: {
    title: "Get Campaign Video History",
    description:
      "Read bounded daily, weekly or monthly cumulative samples for one tracked campaign video.",
    annotations: annotations("Get Campaign Video History", READ_ONLY),
  },

  prepare_campaign_creator_selection: {
    title: "Prepare Campaign Creator Selection",
    description:
      "Save up to 100 matching creator IDs for review before copy or removal. Narrow larger selections.",
    annotations: annotations("Prepare Campaign Creator Selection", WRITE),
  },
  copy_campaign_creators: {
    title: "Copy Campaign Creators",
    description:
      "Copy exact creator IDs or a prepared selection into another campaign. Return source and destination IDs; reuse the same key for retries.",
    annotations: annotations("Copy Campaign Creators", WRITE),
  },
  remove_campaign_creators: {
    title: "Remove Campaign Creators",
    description:
      "Remove explicitly approved creator IDs or a prepared selection from a campaign. Requires confirmation and a stable retry key.",
    annotations: annotations("Remove Campaign Creators", DESTRUCTIVE),
  },

  get_campaign: {
    title: "Get Campaign",
    description: "Read campaign settings and status.",
    annotations: annotations("Get Campaign", READ_ONLY),
  },
  update_campaign: {
    title: "Update Campaign",
    description:
      "Update campaign settings or set active, paused or completed. Active-slot limits still apply.",
    annotations: annotations("Update Campaign", WRITE),
  },
  get_campaign_workflow_counts: {
    title: "Get Campaign Workflow Counts",
    description:
      "Read workflow counts for the same platform, country, source, stage and search context as the roster.",
    annotations: annotations("Get Campaign Workflow Counts", READ_ONLY),
  },
  add_campaign_creator: {
    title: "Add Campaign Creator",
    description:
      "Add a creator by canonical identity or manual username. Existing identities are deduplicated.",
    annotations: annotations("Add Campaign Creator", WRITE),
  },
  update_campaign_creator: {
    title: "Update Campaign Creator",
    description:
      "Edit contact details, memo, outreach metadata or correct the outreach stage. This does not send email or register posted content.",
    annotations: annotations("Update Campaign Creator", WRITE),
  },
} as const;

export const EXPANDED_TOOL_ORDER = [
  "get_campaign",
  "update_campaign",
  "get_campaign_workflow_counts",
  "add_campaign_creator",
  "update_campaign_creator",
  "prepare_campaign_creator_selection",
  "copy_campaign_creators",
  "remove_campaign_creators",
  "get_campaign_revenue",
  "get_campaign_performance",
  "list_campaign_video_performance",
  "list_campaign_creator_performance",
  "get_campaign_video_history",
  "list_email_senders",
  "list_campaign_email_waves",
  "get_campaign_email_wave",
  "cancel_campaign_email_wave",
  "retry_campaign_email_wave",
  "get_creator",
  "list_forms",
  "get_form",
  "create_form",
  "update_form",
  "delete_form",
  "create_file_upload",
  "get_file_upload",
  "complete_file_upload",
  "cancel_file_upload",
  "get_message_attachment_download",
  "list_campaign_creator_files",
  "get_campaign_file_download",
  "remove_campaign_file",
] as const satisfies readonly (keyof typeof EXPANDED_TOOL_METADATA)[];
