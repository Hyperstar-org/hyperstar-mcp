import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { HyperstarMcpConfig } from "./config.js";
import {
  registerHyperstarAuthTools,
  type AuthToolDependencies,
} from "./auth-tools.js";
import { registerHyperstarDiscovery } from "./discovery.js";
import { createHyperstarClient } from "./http.js";
import { packageVersion } from "./package-metadata.js";
import {
  createDynamicHyperstarClient,
  createDynamicWorkspaceToolOptions,
  createRuntimeConfigSnapshotContext,
  type RuntimeConfigSnapshotContext,
  type RuntimeConfigLoader,
} from "./runtime-config.js";
import { createSnapshotToolRegistrar } from "./tool-registrar.js";
import { registerHyperstarTools } from "./tools.js";
import type { WorkspaceToolOptions } from "./workspaces.js";

export type HyperstarMcpServerOptions = {
  readonly loadConfig?: RuntimeConfigLoader | undefined;
  readonly authToolDependencies?: AuthToolDependencies | undefined;
};

/** Create the Hyperstar MCP server and register HTTP-backed workflow tools. */
export function createHyperstarMcpServer(
  config: HyperstarMcpConfig,
  options: HyperstarMcpServerOptions = {},
): McpServer {
  const server = new McpServer({
    name: "hyperstar",
    version: packageVersion(),
  });
  const configSnapshot =
    options.loadConfig === undefined
      ? undefined
      : createRuntimeConfigSnapshotContext(options.loadConfig);
  registerHyperstarDiscovery(server, { apiBaseUrl: config.apiBaseUrl });
  const toolRegistrar =
    configSnapshot === undefined
      ? server
      : createSnapshotToolRegistrar(server, configSnapshot);
  const registerTools = (): void => {
    registerHyperstarAuthTools(
      toolRegistrar,
      authToolDependencies(
        config,
        options.authToolDependencies,
        configSnapshot,
      ),
    );
    const client =
      configSnapshot === undefined
        ? createHyperstarClient({ config })
        : createDynamicHyperstarClient({
            loadConfig: configSnapshot.loadCurrentConfig,
          });
    const toolOptions = workflowToolOptions(config, configSnapshot);
    registerHyperstarTools(toolRegistrar, client, toolOptions);
  };

  registerTools();
  return server;
}

/** Build auth tool dependencies with a secret-free effective auth-mode reader. */
function authToolDependencies(
  config: HyperstarMcpConfig,
  dependencies: AuthToolDependencies | undefined,
  configSnapshot: RuntimeConfigSnapshotContext | undefined,
): AuthToolDependencies {
  return {
    ...dependencies,
    getEffectiveConfig:
      dependencies?.getEffectiveConfig ??
      configSnapshot?.loadCurrentConfig ??
      (() => config),
  };
}

/** Build static or reloadable workspace tool options for workflow tools. */
function workflowToolOptions(
  config: HyperstarMcpConfig,
  configSnapshot: RuntimeConfigSnapshotContext | undefined,
): WorkspaceToolOptions {
  if (configSnapshot !== undefined) {
    return createDynamicWorkspaceToolOptions(configSnapshot.loadCurrentConfig);
  }
  return config.authMode === "cli"
    ? {
        authMode: config.authMode,
        workspaceSelection: config.workspaceSelection,
      }
    : { authMode: config.authMode };
}
