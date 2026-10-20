import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import type { HyperstarClient, JsonValue } from "../src/http.js";
import { registerHyperstarTools } from "../src/tools.js";

class RecordingHyperstarClient implements HyperstarClient {
  async put(): Promise<JsonValue> {
    throw new Error("Unexpected PUT");
  }
  async delete(): Promise<JsonValue> {
    throw new Error("Unexpected DELETE");
  }
  async get(): Promise<JsonValue> {
    throw new Error("Unexpected GET");
  }

  async post(): Promise<JsonValue> {
    throw new Error("Unexpected POST");
  }

  async patch(): Promise<JsonValue> {
    throw new Error("Unexpected PATCH");
  }
}

describe("registered MCP tool input schemas", () => {
  it("enforces recipient selector requirements in registered bulk-email schemas", () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, new RecordingHyperstarClient());

    const readinessSchema = registeredToolInputSchema(
      server,
      "check_bulk_email_readiness",
    );
    expect(() => readinessSchema.parse({ campaign_id: 1 })).toThrow(
      "recipient_target",
    );
    expect(
      readinessSchema.parse({
        campaign_id: 1,
        recipient_target: { type: "ids", campaign_creator_ids: [10] },
      }),
    ).toEqual({
      campaign_id: 1,
      recipient_target: { type: "ids", campaign_creator_ids: [10] },
    });
    expect(
      readinessSchema.parse({
        campaign_id: 1,
        recipient_target: {
          type: "selection",
          campaign_creator_selection: { workflow_filter: "email_not_sent" },
        },
      }),
    ).toEqual({
      campaign_id: 1,
      recipient_target: {
        type: "selection",
        campaign_creator_selection: { workflow_filter: "email_not_sent" },
      },
    });

    const startSchema = registeredToolInputSchema(server, "start_bulk_email");
    expect(() =>
      startSchema.parse({
        campaign_id: 1,
        subject: "Hi",
        body_text: "Hello",
        idempotency_key: "bulk-email-1",
        send_confirmation: "user_authorized",
      }),
    ).toThrow("recipient_target");
    expect(
      startSchema.parse({
        campaign_id: 1,
        subject: "Hi",
        body_text: "Hello",
        idempotency_key: "bulk-email-1",
        send_confirmation: "user_authorized",
        recipient_target: { type: "ids", campaign_creator_ids: [10] },
      }),
    ).toEqual({
      campaign_id: 1,
      subject: "Hi",
      body_text: "Hello",
      idempotency_key: "bulk-email-1",
      send_confirmation: "user_authorized",
      recipient_target: { type: "ids", campaign_creator_ids: [10] },
    });
    expect(() =>
      startSchema.parse({
        campaign_id: 1,
        subject: "Hi",
        body_text: "Hello",
        form_language: "en",
        idempotency_key: "bulk-email-1",
        send_confirmation: "user_authorized",
        recipient_target: { type: "ids", campaign_creator_ids: [10] },
      }),
    ).toThrow("form_id is required when form_language is provided");
    expect(() =>
      startSchema.parse({
        campaign_id: 1,
        subject: "Hi",
        body_text: "Hello",
        idempotency_key: "bulk-email-1",
        send_confirmation: "user_authorized",
        recipient_target: {
          type: "selection",
          campaign_creator_selection: { workflow_filter: "all" },
        },
      }),
    ).toThrow("campaign_creator_selection must include a narrowing filter");
  });
});

function registeredToolInputSchema(
  server: McpServer,
  toolName: string,
): { parse: (input: unknown) => unknown } {
  const internals = server as unknown as {
    readonly _registeredTools: Record<
      string,
      { readonly inputSchema: { parse: (input: unknown) => unknown } }
    >;
  };
  return internals._registeredTools[toolName].inputSchema;
}
