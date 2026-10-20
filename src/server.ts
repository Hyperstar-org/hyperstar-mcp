import { registerUsageTools } from "./usage-tools.js";
import { registerCreatorImportTools } from "./creator-import-tools.js";
import { registerFileTools } from "./file-tools.js";
import { registerCreatorTools } from "./creator-tools.js";
import { registerFormTools } from "./form-tools.js";
import { registerEmailWaveTools } from "./email-wave-tools.js";
import { registerPerformanceTools } from "./performance-tools.js";
import { registerRosterOperationTools } from "./roster-operation-tools.js";
import { registerCampaignTools } from "./campaign-tools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { HyperstarMcpConfig } from "./config.js";
import { registerHyperstarDiscovery } from "./discovery.js";
import { createHyperstarClient, type HyperstarClient } from "./http.js";
import type { Surface } from "./surface.js";
import { packageVersion } from "./package-metadata.js";
import { registerHyperstarTools } from "./tools.js";
import type { WorkspaceToolOptions } from "./workspaces.js";

/** Create the local stdio Hyperstar MCP server bound to one API-key credential. */
export function createHyperstarMcpServer(
  config: HyperstarMcpConfig,
): McpServer {
  const server = new McpServer({
    name: "hyperstar",
    version: packageVersion(),
  });
  registerHyperstarDiscovery(server, { apiBaseUrl: config.apiBaseUrl });
  registerWorkflowSurface(server, createHyperstarClient({ config }), "local", {
    authMode: config.authMode,
  });
  return server;
}

export function registerWorkflowSurface(
  registrar: Parameters<typeof registerHyperstarTools>[0],
  client: HyperstarClient,
  surface: Surface,
  options: WorkspaceToolOptions = {},
  expandedToolsEnabled = true,
  usageToolsEnabled = true,
): void {
  registerHyperstarTools(registrar, client, { ...options, surface });
  if (expandedToolsEnabled) {
    registerCampaignTools(registrar, client);
    registerRosterOperationTools(registrar, client);
    registerPerformanceTools(registrar, client);
    registerEmailWaveTools(registrar, client);
    registerCreatorTools(registrar, client);
    registerFormTools(registrar, client);
    registerFileTools(registrar, client);
  }
  registerCreatorImportTools(registrar, client);
  if (usageToolsEnabled) registerUsageTools(registrar, client);
}
