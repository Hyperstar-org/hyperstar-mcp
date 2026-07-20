import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import type { HyperstarClient, JsonObject, JsonValue } from "../src/http.js";
import { createToolHandlers, registerHyperstarTools } from "../src/tools.js";

type RecordedCall =
  | {
      readonly method: "GET";
      readonly path: string;
      readonly query: URLSearchParams | undefined;
    }
  | {
      readonly method: "POST";
      readonly path: string;
      readonly body: JsonObject | undefined;
      readonly headers: Record<string, string> | undefined;
    }
  | {
      readonly method: "PATCH";
      readonly path: string;
      readonly body: JsonObject | undefined;
    };

class RecordingHyperstarClient implements HyperstarClient {
  readonly calls: RecordedCall[] = [];
  private readonly responses: JsonValue[];

  constructor(responses: readonly JsonValue[]) {
    this.responses = [...responses];
  }

  async get(path: string, query?: URLSearchParams): Promise<JsonValue> {
    this.calls.push({
      method: "GET",
      path,
      query: query === undefined ? undefined : new URLSearchParams(query),
    });
    return this.shiftResponse();
  }

  async post(
    path: string,
    body?: JsonObject,
    headers?: Record<string, string>,
  ): Promise<JsonValue> {
    this.calls.push({ method: "POST", path, body, headers });
    return this.shiftResponse();
  }

  async patch(path: string, body?: JsonObject): Promise<JsonValue> {
    this.calls.push({ method: "PATCH", path, body });
    return this.shiftResponse();
  }

  private shiftResponse(): JsonValue {
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("No fake response queued");
    }
    return response;
  }
}

describe("tool guidance", () => {
  it("registers workflow-oriented tool descriptions", () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, new RecordingHyperstarClient([]));

    expect(registeredToolDescription(server, "search_creators")).toContain(
      "compact creator summaries",
    );
    expect(
      registeredToolDescription(server, "check_bulk_email_readiness"),
    ).toContain("final dry-run gate");
    expect(registeredToolDescription(server, "start_bulk_email")).toContain(
      "REAL SEND",
    );
  });

  it("adds next-step guidance to search and campaign roster responses", async () => {
    const searchId = "550e8400-e29b-41d4-a716-446655440000";
    const client = new RecordingHyperstarClient([
      { search_id: searchId },
      {
        creators: [{ origin_id: "creator_1", username: "mugs_daily" }],
        total: 1,
        offset: 0,
        limit: 25,
      },
      { imported: 1 },
      {
        influencers: [{ id: 7, username: "mugs_daily" }],
        total: 1,
        limit: 50,
        offset: 0,
      },
    ]);
    const handlers = createToolHandlers(client);

    const search = await handlers.searchCreators({
      kind: "semantic",
      platform: "tiktok",
      region: "US",
      query: "ceramic mugs",
      limit: 25,
    });
    expect(search.agent_guidance).toContain("Use list_campaigns");
    expect(search.next_tools).toEqual([
      "list_campaigns",
      "create_campaign",
      "save_search_results_to_campaign",
    ]);

    const imported = await handlers.saveSearchResultsToCampaign({
      campaign_id: 123,
      search_id: searchId,
      limit: 1,
    });
    expect(imported).toMatchObject({
      next_tool: "list_campaign_creators",
      next_arguments: { campaign_id: 123 },
    });

    const roster = await handlers.listCampaignCreators({ campaign_id: 123 });
    expect(roster).toMatchObject({
      next_tool: "check_bulk_email_readiness",
      next_arguments: { campaign_id: 123 },
    });
    expect(roster.next_required_arguments).toEqual(["recipient_target"]);
  });

  it("adds send guidance to readiness only when recipients are sendable", async () => {
    const client = new RecordingHyperstarClient([
      { sendable: 2 },
      { sendable: 0 },
    ]);
    const handlers = createToolHandlers(client);

    const ready = await handlers.checkBulkEmailReadiness({
      campaign_id: 123,
      campaign_creator_ids: [7, 8],
    });
    expect(ready).toMatchObject({
      next_tool: "start_bulk_email",
      next_arguments: {
        campaign_id: 123,
        recipient_target: {
          type: "ids",
          campaign_creator_ids: [7, 8],
        },
      },
    });
    expect(ready.next_required_arguments).toEqual([
      "subject",
      "body_text",
      "idempotency_key",
      "send_confirmation",
    ]);
    expect(ready.agent_guidance).toContain(
      "start_bulk_email performs a real send",
    );
    expect(ready.next_required_arguments).toContain("send_confirmation");

    const notReady = await handlers.checkBulkEmailReadiness({
      campaign_id: 123,
      campaign_creator_ids: [9],
    });
    expect(notReady.next_tool).toBeUndefined();
    expect(notReady.agent_guidance).toContain("Do not call start_bulk_email");
  });
});

function registeredToolDescription(
  server: McpServer,
  toolName: string,
): string | undefined {
  const internals = server as unknown as {
    readonly _registeredTools: Record<
      string,
      { readonly description?: string }
    >;
  };
  return internals._registeredTools[toolName].description;
}
