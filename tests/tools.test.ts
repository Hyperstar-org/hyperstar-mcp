import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { HyperstarClient, JsonObject, JsonValue } from "../src/http.js";
import {
  CheckBulkEmailReadinessInputSchema,
  CampaignCreatorsInputSchema,
  CreateCampaignInputSchema,
  ListCampaignsInputSchema,
  ListInboxThreadsInputSchema,
  ListWorkspacesInputSchema,
  SearchCreatorsInputSchema,
  SaveSearchResultsToCampaignInputSchema,
  SelectWorkspaceInputSchema,
  SendInboxReplyInputSchema,
  StartBulkEmailInputSchema,
  WorkflowGuideInputSchema,
  WhoamiInputSchema,
} from "../src/tool-inputs.js";
import { createHyperstarMcpServer } from "../src/server.js";
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

describe("createToolHandlers", () => {
  it("keeps search and inbox inputs aligned with backend route contracts", () => {
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "mugs",
        limit: 10001,
      }),
    ).toThrow();
    expect(
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "us",
        query: "mugs",
        limit: 10000,
      }),
    ).toMatchObject({ region: "US", limit: 10000 });
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "1!",
        query: "mugs",
      }),
    ).toThrow();
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "youtube",
        region: "US",
        query: "mugs",
      }),
    ).toThrow();
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
      }),
    ).toThrow();
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "reference",
        platform: "tiktok",
        region: "US",
      }),
    ).toThrow();
    expect(
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "mugs",
        sort_by: "follower_count",
      }).sort_by,
    ).toBe("follower_count");
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "instagram",
        region: "US",
        query: "mugs",
        sort_by: "gmv",
      }),
    ).toThrow();
    expect(() =>
      SearchCreatorsInputSchema.parse({
        kind: "semantic",
        platform: "instagram",
        region: "US",
        query: "mugs",
        sort_by: "gpm",
      }),
    ).toThrow();
    expect(() =>
      SaveSearchResultsToCampaignInputSchema.parse({
        campaign_id: 1,
        search_id: "550e8400-e29b-41d4-a716-446655440000",
        platform: "tiktok",
      }),
    ).toThrow();
    expect(ListCampaignsInputSchema.parse({ limit: 100 }).limit).toBe(100);
    expect(() => ListCampaignsInputSchema.parse({ limit: 101 })).toThrow();
    expect(() =>
      ListCampaignsInputSchema.parse({ unexpected: "field" }),
    ).toThrow();
    expect(
      CreateCampaignInputSchema.parse({
        name: "Launch",
        selling_points: ["Quiet workflow"],
      }).name,
    ).toBe("Launch");
    expect(() => CreateCampaignInputSchema.parse({ name: "" })).toThrow();
    expect(() =>
      CreateCampaignInputSchema.parse({ name: "Launch", user_id: "u_1" }),
    ).toThrow();
    expect(
      CampaignCreatorsInputSchema.parse({ campaign_id: 1, limit: 2000 }).limit,
    ).toBe(2000);
    expect(() =>
      CampaignCreatorsInputSchema.parse({ campaign_id: 1, limit: 2001 }),
    ).toThrow();
    expect(() =>
      ListInboxThreadsInputSchema.parse({
        bulk_job_ids: ["not-a-uuid"],
      }),
    ).toThrow();
    expect(ListInboxThreadsInputSchema.parse({ limit: 500 }).limit).toBe(500);
    expect(() => ListInboxThreadsInputSchema.parse({ limit: 501 })).toThrow();
    expect(() =>
      ListInboxThreadsInputSchema.parse({ sort_field: "created_at" }),
    ).toThrow();
    expect(() =>
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
        campaign_creator_ids: [1],
        campaign_creator_selection: { workflow_filter: "email_not_sent" },
      }),
    ).toThrow();
    expect(() =>
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
        campaign_creator_selection: {},
      }),
    ).toThrow();
    expect(() =>
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
        campaign_creator_selection: { workflow_filter: "all" },
      }),
    ).toThrow();
    expect(() =>
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
        campaign_creator_selection: { excluded_ids: [1] },
      }),
    ).toThrow();
    expect(
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
        campaign_creator_selection: {
          workflow_filter: "all",
          platform: "tiktok",
        },
      }),
    ).toMatchObject({
      campaign_creator_selection: {
        workflow_filter: "all",
        platform: "tiktok",
      },
    });
    expect(() =>
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
      }),
    ).toThrow();
    expect(() =>
      CheckBulkEmailReadinessInputSchema.parse({
        campaign_id: 1,
        campaign_creator_selection: { mode: "all" },
      }),
    ).toThrow();
    expect(() =>
      StartBulkEmailInputSchema.parse({
        campaign_id: 1,
        subject: "Hello",
        body_text: "Intro",
        form_language: "ko",
        idempotency_key: "idem-1",
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      StartBulkEmailInputSchema.parse({
        campaign_id: 1,
        subject: "Hello",
        body_text: "Intro",
        idempotency_key: "idem-1",
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      StartBulkEmailInputSchema.parse({
        campaign_id: 1,
        subject: "Hello",
        body_text: "Intro",
        form_id: 1,
        form_language: "fr",
        idempotency_key: "idem-1",
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      StartBulkEmailInputSchema.parse({
        campaign_id: 1,
        subject: "Hello",
        body_text: "Intro",
        idempotency_key: "idem-1\nInjected: x",
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      StartBulkEmailInputSchema.parse({
        campaign_id: 1,
        subject: "Hello",
        body_text: "Intro",
        idempotency_key: "x".repeat(129),
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      SendInboxReplyInputSchema.parse({
        platform: "tiktok",
        thread_id: 1,
        subject: "x".repeat(501),
        body_text: "Intro",
        idempotency_key: "reply-1",
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      SendInboxReplyInputSchema.parse({
        platform: "tiktok",
        thread_id: 1,
        subject: "Hello",
        body_text: "Intro",
        idempotency_key: "reply-1\nInjected: x",
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      SendInboxReplyInputSchema.parse({
        platform: "tiktok",
        thread_id: 1,
        subject: "Hello",
        body_text: "Intro",
        idempotency_key: "x".repeat(129),
        send_confirmation: "user_authorized",
      }),
    ).toThrow();
    expect(() =>
      SendInboxReplyInputSchema.parse({
        platform: "tiktok",
        thread_id: 1,
        subject: "Hello",
        body_text: "Intro",
        idempotency_key: "reply-1",
      }),
    ).toThrow();
    expect(() => WhoamiInputSchema.parse({ unexpected: "field" })).toThrow();
    expect(() =>
      ListWorkspacesInputSchema.parse({ unexpected: "field" }),
    ).toThrow();
    expect(
      SelectWorkspaceInputSchema.parse({ organization_id: "org_123" })
        .organization_id,
    ).toBe("org_123");
    expect(() =>
      SelectWorkspaceInputSchema.parse({ organization_id: "   " }),
    ).toThrow();
    expect(() =>
      WorkflowGuideInputSchema.parse({ unexpected: "field" }),
    ).toThrow();
  });

  it("hyperstarWhoami calls /v1/whoami and parses metadata", async () => {
    const client = new RecordingHyperstarClient([
      {
        actor_type: "service_account",
        user_id: null,
        service_account_id: "svc_123",
        organization_id: "org_123",
        scopes: ["search:read", "campaigns:write"],
        capabilities: {
          search: true,
          campaigns_read: true,
          campaigns_write: true,
          bulk_email: false,
          inbox_read: false,
          inbox_write: false,
        },
      },
    ]);

    const result = await createToolHandlers(client).hyperstarWhoami();

    expect(result).toMatchObject({
      actor_type: "service_account",
      service_account_id: "svc_123",
      organization_id: "org_123",
    });
    expect(client.calls).toEqual([
      { method: "GET", path: "/v1/whoami", query: undefined },
    ]);
  });

  it("searchCreators posts the create request and then gets the first result page", async () => {
    const searchId = "550e8400-e29b-41d4-a716-446655440000";
    const client = new RecordingHyperstarClient([
      { search_id: searchId },
      {
        creators: [{ origin_id: "creator_1", handle: "mugs_daily" }],
        total: 50,
        offset: 0,
        limit: 25,
      },
    ]);

    const result = await createToolHandlers(client).searchCreators({
      kind: "semantic",
      platform: "tiktok",
      region: "US",
      query: "ceramic mugs",
      limit: 25,
    });

    expect(result.search_id).toBe(searchId);
    expect(result.creators).toHaveLength(1);
    expect(result.has_more).toBe(true);
    expect(result.next_offset).toBe(25);
    expect(result.next_tool).toBeUndefined();
    expect(result.next_arguments).toBeUndefined();
    expect(result.next_tools).toEqual([
      "list_campaigns",
      "create_campaign",
      "save_search_results_to_campaign",
    ]);
    expect(client.calls[0]).toEqual({
      method: "POST",
      path: "/v1/searches",
      body: {
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "ceramic mugs",
        limit: 25,
      },
      headers: undefined,
    });
    const resultsCall = client.calls[1];
    expect(resultsCall?.method).toBe("GET");
    if (resultsCall?.method !== "GET") {
      throw new Error("Expected second call to be GET");
    }
    expect(resultsCall.path).toBe(`/v1/searches/${searchId}/results`);
    expect(resultsCall.query?.get("limit")).toBe("25");
    expect(resultsCall.query?.get("offset")).toBe("0");
  });

  it("searchCreators keeps the create window separate from the result page limit", async () => {
    const searchId = "550e8400-e29b-41d4-a716-446655440000";
    const client = new RecordingHyperstarClient([
      { search_id: searchId },
      {
        creators: [],
        total: 250,
        offset: 0,
        limit: 100,
      },
    ]);

    await createToolHandlers(client).searchCreators({
      kind: "semantic",
      platform: "tiktok",
      region: "US",
      query: "ceramic mugs",
      limit: 250,
    });

    expect(client.calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/searches",
      body: expect.objectContaining({ limit: 250 }),
    });
    const resultsCall = client.calls[1];
    expect(resultsCall?.method).toBe("GET");
    if (resultsCall?.method !== "GET") {
      throw new Error("Expected second call to be GET");
    }
    expect(resultsCall.query?.get("limit")).toBe("100");
  });

  it("saveSearchResultsToCampaign uses the backend search-selection import contract", async () => {
    const searchId = "550e8400-e29b-41d4-a716-446655440000";
    const client = new RecordingHyperstarClient([{ imported: 2 }]);

    const result = await createToolHandlers(client).saveSearchResultsToCampaign(
      {
        campaign_id: 7,
        search_id: searchId,
        limit: 2,
        excluded_origin_ids: ["creator_3"],
        reference_id: "agent-run-123",
      },
    );

    expect(result).toMatchObject({ imported: 2 });
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/v1/campaigns/7/creators:import",
        body: {
          mode: "search_selection",
          search_id: searchId,
          limit: 2,
          excluded_origin_ids: ["creator_3"],
          reference_id: "agent-run-123",
        },
        headers: undefined,
      },
    ]);
  });

  it("listCampaigns exposes campaign discovery for agents", async () => {
    const client = new RecordingHyperstarClient([
      {
        campaigns: [
          {
            id: 123,
            name: "Launch",
            status: "active",
            brand: "Hyperstar",
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
      },
    ]);

    const result = await createToolHandlers(client).listCampaigns({
      status: "active",
      limit: 25,
      offset: 0,
    });

    expect(result).toMatchObject({
      total: 1,
      campaigns: [{ id: 123, name: "Launch" }],
    });
    const call = client.calls[0];
    expect(call?.method).toBe("GET");
    if (call?.method !== "GET") {
      throw new Error("Expected first call to be GET");
    }
    expect(call.path).toBe("/v1/campaigns");
    expect(call.query?.get("status")).toBe("active");
    expect(call.query?.get("limit")).toBe("25");
    expect(call.query?.get("offset")).toBe("0");
  });

  it("createCampaign uses the Product API campaign create route without exposing user_id", async () => {
    const client = new RecordingHyperstarClient([
      {
        id: 124,
        name: "MCP Launch",
        status: "draft",
        brand: "Hyperstar",
      },
    ]);

    const result = await createToolHandlers(client).createCampaign({
      name: "MCP Launch",
      brand: "Hyperstar",
      description: "Agent-created test campaign",
      selling_points: ["Fast setup"],
      hashtags: ["mcp"],
    });

    expect(result).toMatchObject({ id: 124, name: "MCP Launch" });
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/v1/campaigns",
        body: {
          name: "MCP Launch",
          brand: "Hyperstar",
          description: "Agent-created test campaign",
          selling_points: ["Fast setup"],
          hashtags: ["mcp"],
        },
        headers: undefined,
      },
    ]);
  });

  it("listCampaignCreators normalizes the legacy influencers response to creators", async () => {
    const client = new RecordingHyperstarClient([
      {
        influencers: [{ id: 77, username: "creator_one" }],
        total: 1,
        limit: 50,
        offset: 0,
      },
    ]);

    const result = await createToolHandlers(client).listCampaignCreators({
      campaign_id: 123,
      limit: 50,
      offset: 0,
    });

    expect(result).toMatchObject({
      creators: [{ id: 77, username: "creator_one" }],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const call = client.calls[0];
    expect(call?.method).toBe("GET");
    if (call?.method !== "GET") {
      throw new Error("Expected first call to be GET");
    }
    expect(call.path).toBe("/v1/campaigns/123/creators");
    expect(call.query?.get("limit")).toBe("50");
    expect(call.query?.get("offset")).toBe("0");
  });

  it("startBulkEmail forwards the idempotency key and returns queue guidance", async () => {
    const client = new RecordingHyperstarClient([{ job_id: "job_123" }]);

    const result = await createToolHandlers(client).startBulkEmail({
      campaign_id: 123,
      subject: "Hello",
      body_text: "Intro",
      campaign_creator_ids: [7],
      idempotency_key: "idem-123",
      send_confirmation: "user_authorized",
    });

    expect(result).toEqual({
      job_id: "job_123",
      status: "queued",
      next_tool: "get_bulk_email_job",
      next_arguments: { job_id: "job_123" },
      agent_guidance:
        "Bulk email job queued. Use get_bulk_email_job with the returned job_id to check progress before taking follow-up action.",
    });
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/v1/campaigns/123/bulk-email/jobs",
        body: {
          subject: "Hello",
          body_text: "Intro",
          campaign_creator_ids: [7],
          idempotency_key: "idem-123",
          send_confirmation: "user_authorized",
        },
        headers: { "Idempotency-Key": "idem-123" },
      },
    ]);
  });

  it("checkBulkEmailReadiness builds the explicit readiness body", async () => {
    const client = new RecordingHyperstarClient([{ sendable: 1 }]);

    const result = await createToolHandlers(client).checkBulkEmailReadiness({
      campaign_id: 123,
      campaign_creator_selection: { workflow_filter: "email_not_sent" },
    });

    expect(result).toMatchObject({ sendable: 1 });
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/v1/campaigns/123/bulk-email/readiness",
        body: {
          campaign_creator_selection: { workflow_filter: "email_not_sent" },
        },
        headers: undefined,
      },
    ]);
  });

  it("getBulkEmailJob encodes unsafe job IDs without changing the path shape", async () => {
    const client = new RecordingHyperstarClient([{ job_id: "abc/../x" }]);

    await createToolHandlers(client).getBulkEmailJob({ job_id: "abc/../x" });

    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/v1/bulk-email/jobs/abc%2F..%2Fx",
        query: undefined,
      },
    ]);
  });

  it("getBulkEmailJob encodes query markers inside the job ID segment", async () => {
    const client = new RecordingHyperstarClient([{ job_id: "abc?x=1" }]);

    await createToolHandlers(client).getBulkEmailJob({ job_id: "abc?x=1" });

    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/v1/bulk-email/jobs/abc%3Fx%3D1",
        query: undefined,
      },
    ]);
  });
});

describe("registerHyperstarTools", () => {
  it("registers auth helper tools before workflow tools on the MCP server", () => {
    const server = createHyperstarMcpServer({
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    });

    expect(registeredToolNames(server)).toEqual([
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
      "start_bulk_email",
      "get_bulk_email_job",
      "list_inbox_threads",
      "get_inbox_thread_messages",
      "get_inbox_aggregates",
      "update_inbox_thread_state",
      "send_inbox_reply",
    ]);
  });

  it("registers all required MCP tool names", () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, new RecordingHyperstarClient([]));

    expect(registeredToolNames(server)).toEqual([
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
      "start_bulk_email",
      "get_bulk_email_job",
      "list_inbox_threads",
      "get_inbox_thread_messages",
      "get_inbox_aggregates",
      "update_inbox_thread_state",
      "send_inbox_reply",
    ]);
  });
});

function registeredToolNames(server: McpServer): string[] {
  const internals = server as unknown as {
    readonly _registeredTools: Record<string, unknown>;
  };
  return Object.keys(internals._registeredTools);
}
