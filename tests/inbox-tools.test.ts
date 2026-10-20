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
