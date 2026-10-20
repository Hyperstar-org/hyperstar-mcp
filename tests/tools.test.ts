import { describe, expect, it } from "vitest";

import type { HyperstarClient, JsonObject, JsonValue } from "../src/http.js";
import { createToolHandlers } from "../src/tools.js";

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
  async put(): Promise<JsonValue> {
    throw new Error("Unexpected PUT");
  }
  async delete(): Promise<JsonValue> {
    throw new Error("Unexpected DELETE");
  }
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
});
