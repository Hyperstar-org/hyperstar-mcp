import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { AUTH_CONFIGURATION_MESSAGE } from "../src/config.js";
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
        "hyperstar_imports_and_usage",
        "hyperstar_headless_workflow",
      );

      const result = await client.callTool({
        name: "hyperstar_whoami",
        arguments: {},
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining(AUTH_CONFIGURATION_MESSAGE),
      });
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
