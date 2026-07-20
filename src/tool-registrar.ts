import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { RuntimeConfigSnapshotContext } from "./runtime-config.js";

export type ToolRegistrar = Pick<McpServer, "registerTool">;

/** Create a registrar that runs each registered handler inside one config snapshot. */
export function createSnapshotToolRegistrar(
  server: McpServer,
  configSnapshot: RuntimeConfigSnapshotContext,
): ToolRegistrar {
  const registerTool = ((name, toolConfig, handler) =>
    server.registerTool(name, toolConfig, ((...args: unknown[]) =>
      configSnapshot.withConfigSnapshot(() =>
        (handler as (...handlerArgs: unknown[]) => unknown)(...args),
      )) as typeof handler)) as McpServer["registerTool"];

  return { registerTool };
}
