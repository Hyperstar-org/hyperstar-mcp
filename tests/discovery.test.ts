import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { createHyperstarMcpServer } from "../src/server.js";

class MemoryTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private peer: MemoryTransport | undefined;

  connect(peer: MemoryTransport): void {
    this.peer = peer;
  }

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    this.peer?.onmessage?.(message);
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

function createTransportPair(): readonly [MemoryTransport, MemoryTransport] {
  const client = new MemoryTransport();
  const server = new MemoryTransport();
  client.connect(server);
  server.connect(client);
  return [client, server] as const;
}

describe("MCP discovery surfaces", () => {
  it("lists tools and guides before auth is configured", async () => {
    const [clientTransport, serverTransport] = createTransportPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const server = createHyperstarMcpServer({
      authMode: "unauthenticated",
      apiBaseUrl: "https://api.example.test",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain(
        "get_hyperstar_workflow_guide",
      );

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain(
        "hyperstar://guide/headless-workflow",
      );

      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain(
        "hyperstar_headless_workflow",
      );

      const result = await client.callTool({
        name: "hyperstar_whoami",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining(
          "Call start_browser_login, then complete_browser_login and select_workspace, or set HYPERSTAR_API_KEY.",
        ),
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("lists and reads Hyperstar workflow resources", async () => {
    const [clientTransport, serverTransport] = createTransportPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const server = createHyperstarMcpServer({
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const listed = await client.listResources();
      expect(listed.resources.map((resource) => resource.uri)).toContain(
        "hyperstar://guide/search-to-campaign",
      );

      const resource = await client.readResource({
        uri: "hyperstar://guide/search-to-campaign",
      });
      expect(resource.contents[0]).toMatchObject({
        uri: "hyperstar://guide/search-to-campaign",
        mimeType: "text/markdown",
      });
      expect(resource.contents[0]?.text).toContain("compact creator summaries");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("lists and returns Hyperstar workflow prompts", async () => {
    const [clientTransport, serverTransport] = createTransportPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const server = createHyperstarMcpServer({
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const listed = await client.listPrompts();
      expect(listed.prompts.map((prompt) => prompt.name)).toEqual([
        "hyperstar_headless_workflow",
        "hyperstar_search_to_campaign",
        "hyperstar_bulk_email_safety",
        "hyperstar_inbox_workflow",
      ]);

      const prompt = await client.getPrompt({
        name: "hyperstar_bulk_email_safety",
      });
      expect(prompt.messages[0]?.role).toBe("user");
      expect(prompt.messages[0]?.content.type).toBe("text");
      if (prompt.messages[0]?.content.type !== "text") {
        throw new Error("Expected text prompt content");
      }
      expect(prompt.messages[0].content.text).toContain(
        "start_bulk_email performs a real send",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("does not expose internal smoke-test fixture details through discovery", async () => {
    const [clientTransport, serverTransport] = createTransportPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const server = createHyperstarMcpServer({
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const listed = await client.listResources();
      expect(listed.resources.map((resource) => resource.uri)).not.toContain(
        "hyperstar://guide/internal-fixture",
      );

      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).not.toContain(
        "hyperstar_internal_fixture",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
