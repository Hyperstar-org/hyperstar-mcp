import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerHyperstarDiscovery } from "../discovery.js";
import type { HyperstarClient } from "../http.js";
import { packageVersion } from "../package-metadata.js";
import { registerWorkflowSurface } from "../server.js";
import { isHostedTool } from "../surface.js";
import type { ToolRegistrar } from "../tool-registrar.js";
import { toolScopes } from "../tool-scopes.js";

export function createHostedMcpServer(
  client: HyperstarClient,
  apiBaseUrl: string,
  expandedToolsEnabled = false,
  usageToolsEnabled = false,
): McpServer {
  const server = new McpServer({
    name: "hyperstar",
    version: packageVersion(),
  });
  const registerTool: McpServer["registerTool"] = (name, config, handler) => {
    if (!isHostedTool(name))
      throw new Error("Tool is not included in the hosted surface");
    return server.registerTool(
      name,
      {
        ...config,
        _meta: {
          ...config._meta,
          securitySchemes: [{ type: "oauth2", scopes: toolScopes(name) }],
        },
      },
      handler,
    );
  };
  const registrar: ToolRegistrar = { registerTool };
  registerWorkflowSurface(
    registrar,
    client,
    "hosted",
    {},
    expandedToolsEnabled,
    usageToolsEnabled,
  );
  registerHyperstarDiscovery(server, { apiBaseUrl, surface: "hosted" });
  return server;
}
