import { describe, expect, it } from "vitest";

import { bulkEmailQueuedResult } from "../src/bulk-email-guidance.js";

describe("bulkEmailQueuedResult", () => {
  it("explains queued bulk-email jobs with the polling tool", () => {
    expect(bulkEmailQueuedResult({ job_id: "job_123" })).toEqual({
      job_id: "job_123",
      status: "queued",
      next_tool: "get_bulk_email_job",
      next_arguments: { job_id: "job_123" },
      agent_guidance:
        "Bulk email job queued. Use get_bulk_email_job with the returned job_id to check progress before taking follow-up action.",
    });
  });

  it("explains completed zero-recipient jobs without queue wording", () => {
    expect(
      bulkEmailQueuedResult({
        job_id: "job_empty",
        status: "completed",
        total_recipients: 0,
        message: "No contacts with email found in list",
      }),
    ).toEqual({
      job_id: "job_empty",
      status: "completed",
      total_recipients: 0,
      message: "No contacts with email found in list",
      next_tool: "get_bulk_email_job",
      next_arguments: { job_id: "job_empty" },
      agent_guidance:
        "No bulk email was queued because the selected recipients have no sendable email addresses. Adjust the campaign recipients or run check_bulk_email_readiness before trying again.",
    });
  });
});
