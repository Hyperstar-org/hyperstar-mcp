import { AsyncLocalStorage } from "node:async_hooks";

import type { CliWorkspaceSelection, HyperstarMcpConfig } from "./config.js";
import { createHyperstarClient, type HyperstarClient } from "./http.js";
import type { WorkspaceToolOptions } from "./workspaces.js";

export type RuntimeConfigLoader = () =>
  HyperstarMcpConfig | Promise<HyperstarMcpConfig>;

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export type RuntimeConfigSnapshotContext = {
  readonly loadCurrentConfig: RuntimeConfigLoader;
  readonly withConfigSnapshot: <T>(action: () => T | Promise<T>) => Promise<T>;
};

/** Create a per-async-call config snapshot boundary for dynamic MCP tools. */
export function createRuntimeConfigSnapshotContext(
  loadConfig: RuntimeConfigLoader,
): RuntimeConfigSnapshotContext {
  const snapshots = new AsyncLocalStorage<HyperstarMcpConfig>();

  return {
    loadCurrentConfig: async () => snapshots.getStore() ?? (await loadConfig()),
    withConfigSnapshot: async (action) => {
      const snapshot = await loadConfig();
      return await snapshots.run(snapshot, action);
    },
  };
}

/** Create a Hyperstar client that reloads MCP config before every HTTP call. */
export function createDynamicHyperstarClient(options: {
  readonly loadConfig: RuntimeConfigLoader;
  readonly fetcher?: Fetcher | undefined;
}): HyperstarClient {
  const clientForCurrentConfig = async (): Promise<HyperstarClient> =>
    createHyperstarClient({
      config: await options.loadConfig(),
      fetcher: options.fetcher,
    });

  return {
    get: async (path, query) =>
      (await clientForCurrentConfig()).get(path, query),
    post: async (path, body, headers) =>
      (await clientForCurrentConfig()).post(path, body, headers),
    patch: async (path, body) =>
      (await clientForCurrentConfig()).patch(path, body),
  };
}

/** Create workspace tool options that resolve auth mode per tool invocation. */
export function createDynamicWorkspaceToolOptions(
  loadConfig: RuntimeConfigLoader,
): WorkspaceToolOptions {
  const resolveConfig = async (): Promise<HyperstarMcpConfig> =>
    await loadConfig();

  return {
    getAuthMode: async () => (await resolveConfig()).authMode,
    getWorkspaceSelection: async (): Promise<
      CliWorkspaceSelection | undefined
    > => {
      const config = await resolveConfig();
      return config.authMode === "cli" ? config.workspaceSelection : undefined;
    },
  };
}
