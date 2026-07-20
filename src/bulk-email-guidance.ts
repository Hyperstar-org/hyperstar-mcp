import type { JsonObject } from "./http.js";
import { compactJsonObject } from "./tool-http-helpers.js";

/** Add agent-facing follow-up instructions to accepted bulk-email jobs. */
export function bulkEmailQueuedResult(job: JsonObject): JsonObject {
  const jobId = stringValue(job.job_id);
  return compactJsonObject([
    ...Object.entries(job),
    ["status", stringValue(job.status) ?? "queued"],
    ["next_tool", "get_bulk_email_job"],
    [
      "next_arguments",
      jobId === undefined
        ? undefined
        : ({ job_id: jobId } satisfies JsonObject),
    ],
    ["agent_guidance", bulkEmailAgentGuidance(job)],
  ]);
}

/** Return next-step guidance that matches the backend job terminal state. */
function bulkEmailAgentGuidance(job: JsonObject): string {
  if (
    stringValue(job.status) === "completed" &&
    numberValue(job.total_recipients) === 0
  ) {
    return "No bulk email was queued because the selected recipients have no sendable email addresses. Adjust the campaign recipients or run check_bulk_email_readiness before trying again.";
  }
  return "Bulk email job queued. Use get_bulk_email_job with the returned job_id to check progress before taking follow-up action.";
}

/** Return string values without coercing unexpected API payload shapes. */
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Return finite numeric values without coercing unexpected API payload shapes. */
function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
