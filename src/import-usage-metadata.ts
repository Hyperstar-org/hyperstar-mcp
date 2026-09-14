import {
  annotations,
  READ_ONLY,
  WRITE,
  DESTRUCTIVE,
} from "./tool-annotations.js";

export const IMPORT_USAGE_METADATA = {
  create_campaign_creator_import: {
    title: "Prepare Spreadsheet Import",
    description:
      "Prepare a CSV/XLSX campaign import with a stable idempotency key. Choose browser handoff when the client cannot upload bytes; direct mode returns an S3 multipart POST. This does not start the import.",
    annotations: annotations("Prepare Spreadsheet Import", WRITE),
  },
  confirm_campaign_creator_import: {
    title: "Confirm Spreadsheet Import",
    description:
      "Start the uploaded canonical import only after user approval. Successful AND skipped rows consume upload quota; errors and unprocessed rows are refunded. Does not unlock emails or send mail.",
    annotations: annotations("Confirm Spreadsheet Import", DESTRUCTIVE),
  },
  get_campaign_creator_import: {
    title: "Get Spreadsheet Import",
    description:
      "Read import progress, quota accounting and bounded row issues using the same job or handoff reference.",
    annotations: annotations("Get Spreadsheet Import", READ_ONLY),
  },
  get_campaign_creator_import_results: {
    title: "Get Import Result File",
    description:
      "Get the result CSV for a terminal import. Result generation can remain pending after completion; preserve the reference and never reimport to retrieve results. Files expire after seven days.",
    annotations: annotations("Get Import Result File", READ_ONLY),
  },
  cancel_campaign_creator_import: {
    title: "Cancel Unstarted Import",
    description:
      "Cancel a pending handoff or awaiting-upload/queued job. Processing jobs cannot be cancelled. Returns the actual state if the job already finished.",
    annotations: annotations("Cancel Unstarted Import", WRITE),
  },
  get_workspace_usage: {
    title: "Get Workspace Usage",
    description:
      "Read available credits, upload quota and occupied creator/campaign capacity. Requires usage:read. Read-only; does not initialize balances or reserve units.",
    annotations: annotations("Get Workspace Usage", READ_ONLY),
  },
  check_operation_capacity: {
    title: "Check Operation Capacity",
    description:
      "Advisory check for an import row count, saved-creator count, one campaign or email unlock. Unlock estimates accept 1–500 unique campaign roster IDs and also require campaigns:read. Never a reservation or guaranteed price.",
    annotations: annotations("Check Operation Capacity", READ_ONLY),
  },
} as const;

export const IMPORT_USAGE_ORDER = [
  "create_campaign_creator_import",
  "get_campaign_creator_import",
  "confirm_campaign_creator_import",
  "cancel_campaign_creator_import",
  "get_campaign_creator_import_results",
  "get_workspace_usage",
  "check_operation_capacity",
] as const;
