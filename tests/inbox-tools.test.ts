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

describe("inbox tool handlers", () => {
  it("reads one bounded history page at a time and carries continuation", async () => {
    const client = new RecordingHyperstarClient([
      {
        thread_id: 42,
        messages: [{ id: 2 }, { id: 3 }],
        next_cursor: "older-page",
      },
      { thread_id: 42, messages: [{ id: 1 }], next_cursor: null },
    ]);
    const handlers = createToolHandlers(client);
    const first = await handlers.getInboxThreadMessages({
      platform: "youtube",
      thread_id: 42,
    });
    expect(first.messages).toEqual([{ id: 2 }, { id: 3 }]);
    expect(first.next_arguments).toEqual({
      platform: "youtube",
      thread_id: 42,
      limit: 50,
      cursor: "older-page",
    });
    expect(client.calls).toHaveLength(1);
    const firstCall = client.calls[0];
    if (firstCall?.method !== "GET") throw new Error("Expected a page read");
    expect(firstCall.path).toBe("/v1/inbox/threads/youtube/42/messages");
    expect(firstCall.query?.get("limit")).toBe("50");
    expect(firstCall.query?.get("cursor")).toBeNull();
    const last = await handlers.getInboxThreadMessages({
      platform: "youtube",
      thread_id: 42,
      limit: 50,
      cursor: "older-page",
    });
    expect(last.messages).toEqual([{ id: 1 }]);
    expect(last.next_cursor).toBeNull();
    expect(last.next_tool).toBeUndefined();
    expect(client.calls).toHaveLength(2);
    const secondCall = client.calls[1];
    if (secondCall?.method !== "GET") throw new Error("Expected a page read");
    expect(secondCall.query?.get("cursor")).toBe("older-page");
  });

  it("accepts complete history from an API deployed before pagination", async () => {
    const client = new RecordingHyperstarClient([
      { thread_id: 42, messages: [{ id: 1 }] },
    ]);
    const result = await createToolHandlers(client).getInboxThreadMessages({
      platform: "instagram",
      thread_id: 42,
    });
    expect(result.messages).toEqual([{ id: 1 }]);
    expect(result.next_tool).toBeUndefined();
    expect(client.calls).toHaveLength(1);
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
});
