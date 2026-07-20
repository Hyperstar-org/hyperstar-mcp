import { describe, expect, it } from "vitest";

import {
  buildWorkflowMarkdown,
  workflowGuideResourceDefinitions,
} from "../src/workflow-content.js";

describe("workflow content", () => {
  it("defines stable guide resources for agent discovery", () => {
    expect(
      workflowGuideResourceDefinitions.map((resource) => resource.uri),
    ).toEqual([
      "hyperstar://guide/headless-workflow",
      "hyperstar://guide/search-to-campaign",
      "hyperstar://guide/bulk-email-safety",
      "hyperstar://guide/inbox",
    ]);
  });

  it("documents compact search and detail-on-demand behavior", () => {
    const markdown = buildWorkflowMarkdown("search-to-campaign");

    expect(markdown).toContain("compact creator summaries");
    expect(markdown).toContain('detail_level: "full"');
    expect(markdown).toContain("search_id");
    expect(markdown).toContain("save_search_results_to_campaign");
  });

  it("documents browser-login tools before local workspace selection", () => {
    const markdown = buildWorkflowMarkdown("headless-workflow");

    expect(markdown).toContain("## Local browser flow");
    expect(markdown).toContain("1. start_browser_login");
    expect(markdown).toContain("2. complete_browser_login");
    expect(markdown).toContain("3. list_workspaces");
    expect(markdown).not.toContain("## Local browser CLI flow");
  });

  it("keeps real-send safety guidance explicit", () => {
    const markdown = buildWorkflowMarkdown("bulk-email-safety");

    expect(markdown).toContain("check_bulk_email_readiness");
    expect(markdown).toContain("start_bulk_email performs a real send");
    expect(markdown).toContain("idempotency_key");
    expect(markdown).toContain("get_bulk_email_job");
  });

  it("tells agents to read full inbox messages before replying", () => {
    const markdown = buildWorkflowMarkdown("inbox");

    expect(markdown).toContain("get_inbox_thread_messages");
    expect(markdown).toContain("full message history");
    expect(markdown).toContain('send_confirmation: "user_authorized"');
  });
});
