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

describe("inbox tool handlers", () => {
  it("listInboxThreads maps filters to query params", async () => {
    const client = new RecordingHyperstarClient([
      { threads: [], total: 0, offset: 10, limit: 50 },
    ]);

    const result = await createToolHandlers(client).listInboxThreads({
      limit: 50,
      offset: 10,
      search: "reply due",
      unread_only: true,
      actionable_only: false,
      archived: false,
      platforms: ["tiktok", "instagram"],
    });

    const call = client.calls[0];
    expect(call?.method).toBe("GET");
    if (call?.method !== "GET") {
      throw new Error("Expected first call to be GET");
    }
    expect(call.path).toBe("/v1/inbox/threads");
    expect(call.query?.get("limit")).toBe("50");
    expect(call.query?.get("offset")).toBe("10");
    expect(call.query?.get("search")).toBe("reply due");
    expect(call.query?.get("unread_only")).toBe("true");
    expect(call.query?.get("actionable_only")).toBe("false");
    expect(call.query?.get("archived")).toBe("false");
    expect(call.query?.getAll("platforms")).toEqual(["tiktok", "instagram"]);
    expect(result.next_tools).toEqual([
      "get_inbox_thread_messages",
      "get_inbox_aggregates",
      "update_inbox_thread_state",
    ]);
    expect(result.agent_guidance).toContain(
      "send_inbox_reply performs a real send",
    );
  });

  it("updateInboxThreadState posts explicit workspace state fields", async () => {
    const client = new RecordingHyperstarClient([{ archived: true }]);

    const result = await createToolHandlers(client).updateInboxThreadState({
      platform: "tiktok",
      thread_id: 42,
      archived: true,
      clear_snooze: true,
      read_state: "read",
    });

    expect(result).toEqual({ archived: true });
    expect(client.calls).toEqual([
      {
        method: "PATCH",
        path: "/v1/inbox/threads/tiktok/42/state",
        body: {
          archived: true,
          clear_snooze: true,
          read_state: "read",
        },
      },
    ]);
  });

  it("sendInboxReply posts an explicit idempotent reply body", async () => {
    const client = new RecordingHyperstarClient([
      { message_id: 99, status: "sent" },
    ]);

    const result = await createToolHandlers(client).sendInboxReply({
      platform: "instagram",
      thread_id: 42,
      subject: "Re: Hello",
      body_text: "Reply body",
      idempotency_key: "reply-42",
      send_confirmation: "user_authorized",
    });

    expect(result).toEqual({ message_id: 99, status: "sent" });
    expect(client.calls).toEqual([
      {
        method: "POST",
        path: "/v1/inbox/threads/instagram/42/replies",
        body: {
          subject: "Re: Hello",
          body_text: "Reply body",
          idempotency_key: "reply-42",
          send_confirmation: "user_authorized",
        },
        headers: undefined,
      },
    ]);
  });

  it("getInboxThreadMessages fetches full message history for one thread", async () => {
    const client = new RecordingHyperstarClient([
      { thread_id: 42, messages: [{ id: 1, direction: "inbound" }] },
    ]);

    const result = await createToolHandlers(client).getInboxThreadMessages({
      platform: "instagram",
      thread_id: 42,
    });

    expect(result).toEqual({
      thread_id: 42,
      messages: [{ id: 1, direction: "inbound" }],
      next_tools: ["send_inbox_reply", "update_inbox_thread_state"],
      agent_guidance:
        'Review the full message history before drafting. send_inbox_reply performs a real send and requires send_confirmation: "user_authorized".',
    });
    expect(client.calls).toEqual([
      {
        method: "GET",
        path: "/v1/inbox/threads/instagram/42/messages",
        query: undefined,
      },
    ]);
  });
});
