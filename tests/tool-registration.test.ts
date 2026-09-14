import { HYPERSTAR_TOOL_ORDER } from "../src/tool-metadata.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import type { HyperstarClient } from "../src/http.js";
import { createHyperstarMcpServer } from "../src/server.js";
import { registerHyperstarTools } from "../src/tools.js";

const unusedClient: HyperstarClient = {
  async get() {
    throw new Error("Unexpected request");
  },
  async post() {
    throw new Error("Unexpected request");
  },
  async patch() {
    throw new Error("Unexpected request");
  },
};

const workflowToolNames = [
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
];

describe("registerHyperstarTools", () => {
  it("registers auth helper tools before workflow tools on the MCP server", () => {
    const server = createHyperstarMcpServer({
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    });

    expect(registeredToolNames(server)).toEqual(HYPERSTAR_TOOL_ORDER);
  });

  it("registers all required MCP tool names", () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, unusedClient);

    expect(registeredToolNames(server)).toEqual(workflowToolNames);
  });
});

function registeredToolNames(server: McpServer): string[] {
  const internals = server as unknown as {
    readonly _registeredTools: Record<string, unknown>;
  };
  return Object.keys(internals._registeredTools);
}
