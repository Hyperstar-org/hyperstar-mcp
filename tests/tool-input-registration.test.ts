import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import type { HyperstarClient, JsonValue } from "../src/http.js";
import { registerHyperstarTools } from "../src/tools.js";

class RecordingHyperstarClient implements HyperstarClient {
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
  it("registers full strict schemas instead of raw shapes", () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, new RecordingHyperstarClient());

    const searchSchema = registeredToolInputSchema(server, "search_creators");

    expect(() =>
      searchSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "mugs",
        unexpected: "legacy-field",
      }),
    ).toThrow();
    expect(
      searchSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "mugs",
        filters: {
          follower_range: { min: 1000, max: 100000 },
          avg_engagement_rate: { min: 0.02 },
          has_email: true,
        },
        detail_level: "full",
      }),
    ).toMatchObject({
      detail_level: "full",
      filters: {
        follower_range: { min: 1000, max: 100000 },
        has_email: true,
      },
    });
    expect(() =>
      searchSchema.parse({
        kind: "semantic",
        platform: "tiktok",
        region: "US",
        query: "mugs",
        filters: {
          country: "US",
          categories: ["home"],
          follower_count: { max: 100000 },
        },
      }),
    ).toThrow();
    expect(() =>
      searchSchema.parse({
        kind: "semantic",
        platform: "instagram",
        region: "US",
        query: "mugs",
        filters: {
          gmv: { min: 100 },
        },
      }),
    ).toThrow();
    expect(() =>
      searchSchema.parse({
        kind: "semantic",
        platform: "instagram",
        region: "US",
        query: "mugs",
        filters: {
          gpm: { min: 10 },
        },
      }),
    ).toThrow();
    expect(() =>
      registeredToolInputSchema(server, "get_search_results").parse({
        search_id: "550e8400-e29b-41d4-a716-446655440000",
        detail_level: "verbose",
      }),
    ).toThrow();
    expect(() =>
      registeredToolInputSchema(server, "hyperstar_whoami").parse({
        unexpected: "field",
      }),
    ).toThrow();
    expect(() =>
      registeredToolInputSchema(server, "list_workspaces").parse({
        unexpected: "field",
      }),
    ).toThrow();
    expect(
      registeredToolInputSchema(server, "select_workspace").parse({
        organization_id: "org_123",
      }),
    ).toEqual({ organization_id: "org_123" });
    expect(() =>
      registeredToolInputSchema(server, "get_hyperstar_workflow_guide").parse({
        unexpected: "field",
      }),
    ).toThrow();
    expect(
      registeredToolInputSchema(server, "list_campaigns").parse({
        status: "active",
        limit: 20,
      }),
    ).toEqual({ status: "active", limit: 20 });
    expect(() =>
      registeredToolInputSchema(server, "create_campaign").parse({
        name: "Launch",
        user_id: "not-agent-facing",
      }),
    ).toThrow();
  });

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

  it("exposes bulk-email arguments through MCP listTools discovery", async () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, new RecordingHyperstarClient());
    const client = new Client({
      name: "hyperstar-test-client",
      version: "0.1.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();

      expect(listedToolSchema(tools, "check_bulk_email_readiness")).toEqual(
        expect.objectContaining({
          required: expect.arrayContaining(["campaign_id", "recipient_target"]),
          properties: expect.objectContaining({
            campaign_id: expect.any(Object),
            recipient_target: expect.any(Object),
          }),
        }),
      );
      expect(listedToolSchema(tools, "start_bulk_email")).toEqual(
        expect.objectContaining({
          required: expect.arrayContaining([
            "campaign_id",
            "recipient_target",
            "subject",
            "body_text",
            "idempotency_key",
            "send_confirmation",
          ]),
          properties: expect.objectContaining({
            campaign_id: expect.any(Object),
            subject: expect.any(Object),
            body_text: expect.any(Object),
            idempotency_key: expect.any(Object),
            send_confirmation: expect.any(Object),
            recipient_target: expect.any(Object),
          }),
        }),
      );
      expect(listedToolSchema(tools, "get_inbox_thread_messages")).toEqual(
        expect.objectContaining({
          required: expect.arrayContaining(["platform", "thread_id"]),
          properties: expect.objectContaining({
            platform: expect.any(Object),
            thread_id: expect.any(Object),
          }),
        }),
      );
      expect(listedToolSchema(tools, "send_inbox_reply")).toEqual(
        expect.objectContaining({
          required: expect.arrayContaining([
            "platform",
            "thread_id",
            "subject",
            "body_text",
            "idempotency_key",
            "send_confirmation",
          ]),
          properties: expect.objectContaining({
            send_confirmation: expect.any(Object),
          }),
        }),
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("describes high-confusion fields in MCP listTools discovery", async () => {
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarTools(server, new RecordingHyperstarClient());
    const client = new Client({
      name: "hyperstar-test-client",
      version: "0.1.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();

      expect(propertyDescription(tools, "search_creators", "kind")).toContain(
        "semantic",
      );
      expect(propertyDescription(tools, "search_creators", "region")).toContain(
        "two-letter",
      );
      expect(
        propertyDescription(tools, "search_creators", "filters"),
      ).toContain("structured");
      expect(
        propertyDescription(tools, "get_search_results", "search_id"),
      ).toContain("search_creators");
      expect(
        propertyDescription(
          tools,
          "save_search_results_to_campaign",
          "campaign_id",
        ),
      ).toContain("list_campaigns");
      expect(
        propertyDescription(tools, "check_bulk_email_readiness", "campaign_id"),
      ).toContain("list_campaigns");
      expect(
        propertyDescription(
          tools,
          "check_bulk_email_readiness",
          "recipient_target",
        ),
      ).toContain('{type:"ids"}');
      expect(
        propertyDescription(
          tools,
          "check_bulk_email_readiness",
          "recipient_target",
        ),
      ).toContain('{type:"selection"}');
      expect(
        propertyDescription(tools, "start_bulk_email", "campaign_id"),
      ).toContain("list_campaigns");
      expect(
        propertyDescription(tools, "start_bulk_email", "recipient_target"),
      ).toContain('{type:"ids"}');
      expect(
        propertyDescription(tools, "start_bulk_email", "recipient_target"),
      ).toContain('{type:"selection"}');
      expect(
        propertyDescription(tools, "start_bulk_email", "idempotency_key"),
      ).toContain("retry");
      expect(
        propertyDescription(tools, "start_bulk_email", "send_confirmation"),
      ).toContain("user_authorized");
      expect(
        propertyDescription(tools, "send_inbox_reply", "idempotency_key"),
      ).toContain("retry");
      expect(
        propertyDescription(tools, "send_inbox_reply", "send_confirmation"),
      ).toContain("user_authorized");
    } finally {
      await client.close();
      await server.close();
    }
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

function listedToolSchema(
  tools: Awaited<ReturnType<Client["listTools"]>>,
  toolName: string,
): {
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
} {
  return (
    (tools.tools.find((tool) => tool.name === toolName)?.inputSchema as
      | {
          readonly properties?: Record<string, unknown>;
          readonly required?: readonly string[];
        }
      | undefined) ?? {}
  );
}

function propertyDescription(
  tools: Awaited<ReturnType<Client["listTools"]>>,
  toolName: string,
  propertyName: string,
): string {
  const property = listedToolSchema(tools, toolName).properties?.[
    propertyName
  ] as { readonly description?: string } | undefined;
  return property?.description ?? "";
}
