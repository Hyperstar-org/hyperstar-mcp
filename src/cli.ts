#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import {
  createCliAuthClient,
  createStoredCliAccessTokenProvider,
  type Fetcher,
} from "./auth/cli-auth-client.js";
import {
  createFileCliAuthStateStore,
  type CliAuthStateStore,
} from "./auth/cli-auth-state.js";
import type {
  LocalCallbackOptions,
  LocalCallbackServer,
} from "./auth/local-callback.js";
import {
  createBrowserLoginManager,
  resolveLoginBaseUrls,
} from "./auth/browser-login.js";
import { createCliWorkspaceSelection } from "./config.js";
import { createHyperstarClient, type JsonValue } from "./http.js";
import {
  BROWSER_ACCOUNT_SWITCH_GUIDANCE,
  BROWSER_SESSION_BOUNDARY,
  CLI_USAGE,
  WORKSPACE_SELECTION_GUIDANCE,
} from "./cli-messages.js";

export type CliDependencies = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetcher?: Fetcher | undefined;
  readonly openBrowser?: (url: URL) => Promise<void>;
  readonly startCallback?: (
    options: LocalCallbackOptions,
  ) => Promise<LocalCallbackServer>;
  readonly stateStore?: CliAuthStateStore;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  readonly now?: (() => Date) | undefined;
};

type ParsedCommand = {
  readonly positionals: readonly string[];
  readonly json: boolean;
  readonly help: boolean;
  readonly noOpen: boolean;
};

/** Return whether a module URL is the process entrypoint, following npm bin symlinks. */
export function isDirectCliInvocation(
  moduleUrl: string,
  argvPath: string | undefined,
  resolveRealpath: (path: string) => string = realpathSync,
): boolean {
  if (argvPath === undefined) {
    return false;
  }
  try {
    return (
      resolveRealpath(fileURLToPath(moduleUrl)) === resolveRealpath(argvPath)
    );
  } catch {
    return false;
  }
}

/** Run the Hyperstar CLI with injectable process boundaries for tests. */
export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: CliDependencies = {},
): Promise<number> {
  const stdout =
    dependencies.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr =
    dependencies.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  try {
    const command = parseCommand(argv);
    if (command.help) {
      stdout(CLI_USAGE);
      return 0;
    }
    const env = dependencies.env ?? process.env;
    const store =
      dependencies.stateStore ?? createFileCliAuthStateStore({ env });
    const fetcher = dependencies.fetcher;

    if (command.positionals[0] === "login") {
      await login({
        env,
        store,
        fetcher,
        stdout,
        dependencies,
        noOpen: command.noOpen,
      });
      return 0;
    }
    if (command.positionals[0] === "logout") {
      await logout({ store, fetcher, stdout });
      return 0;
    }
    if (command.positionals[0] === "whoami") {
      await whoami({
        store,
        fetcher,
        stdout,
        json: command.json,
        now: dependencies.now,
      });
      return 0;
    }
    if (
      command.positionals[0] === "workspaces" &&
      command.positionals[1] === "list"
    ) {
      await listWorkspaces({
        store,
        fetcher,
        stdout,
        json: command.json,
        now: dependencies.now,
      });
      return 0;
    }
    if (
      command.positionals[0] === "workspaces" &&
      command.positionals[1] === "use"
    ) {
      await useWorkspace({
        store,
        fetcher,
        stdout,
        workspaceId: command.positionals[2],
        now: dependencies.now,
      });
      return 0;
    }

    stderr(CLI_USAGE);
    return 2;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** Parse CLI arguments using Node's standard parser. */
function parseCommand(argv: readonly string[]): ParsedCommand {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const parsed = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      "no-open": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  return {
    positionals: parsed.positionals,
    json: parsed.values.json ?? false,
    help: parsed.values.help ?? false,
    noOpen: parsed.values["no-open"] ?? false,
  };
}

/** Complete browser-based local login and persist token state. */
async function login(options: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly stdout: (line: string) => void;
  readonly dependencies: CliDependencies;
  readonly noOpen: boolean;
}): Promise<void> {
  const baseUrls = resolveLoginBaseUrls(options.env);
  const manager = createBrowserLoginManager({
    env: options.env,
    store: options.store,
    fetcher: options.fetcher,
    openBrowser: options.dependencies.openBrowser,
    startCallback: options.dependencies.startCallback,
  });
  const started = await manager.startLogin({
    noOpen: options.noOpen,
    onReady: (metadata) => {
      options.stdout(`Hyperstar API: ${baseUrls.apiBaseUrl}`);
      options.stdout(`Hyperstar app: ${baseUrls.appBaseUrl}`);
      options.stdout(
        `Open this URL to authorize Hyperstar CLI: ${metadata.authorizeUrl}`,
      );
      options.stdout(BROWSER_SESSION_BOUNDARY);
      if (options.noOpen) {
        options.stdout(
          "Browser auto-open disabled. Open the URL above in a browser on this machine.",
        );
      }
    },
    onBrowserOpenFailed: () => {
      options.stdout(
        "Could not open your browser automatically. Copy the URL above into your browser.",
      );
    },
  });

  while (true) {
    const result = await manager.completeLogin({ loginId: started.loginId });
    if (result.status === "authenticated") {
      options.stdout("Logged in to Hyperstar.");
      options.stdout(WORKSPACE_SELECTION_GUIDANCE);
      return;
    }
    if (result.status === "failed") {
      throw new Error(result.error);
    }
    if (result.status === "not_found") {
      throw new Error("Hyperstar login session was not found");
    }
    await sleep(25);
  }
}

/** Log out remotely when possible and remove local auth state. */
async function logout(options: {
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly stdout: (line: string) => void;
}): Promise<void> {
  await options.store.withExclusiveLock(async () => {
    const state = await options.store.read();
    if (state !== null) {
      const client = createCliAuthClient({
        apiBaseUrl: state.apiBaseUrl,
        appBaseUrl: state.appBaseUrl,
        fetcher: options.fetcher,
      });
      try {
        await client.logout(state.refreshToken);
      } finally {
        await options.store.clear();
      }
    } else {
      await options.store.clear();
    }
  });
  options.stdout("Logged out of Hyperstar.");
  options.stdout(BROWSER_ACCOUNT_SWITCH_GUIDANCE);
}

/** Print the authenticated principal from the Product API. */
async function whoami(options: {
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly stdout: (line: string) => void;
  readonly json: boolean;
  readonly now?: (() => Date) | undefined;
}): Promise<void> {
  const client = await createCliProductClient(options);
  const payload = await client.get("/v1/whoami");
  printPayload(payload, options.json, options.stdout);
}

/** List workspaces available to the logged-in CLI user. */
async function listWorkspaces(options: {
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly stdout: (line: string) => void;
  readonly json: boolean;
  readonly now?: (() => Date) | undefined;
}): Promise<void> {
  const { authClient, accessToken } = await createWorkspaceClient(options);
  const payload = await authClient.listWorkspaces(accessToken);
  if (options.json) {
    options.stdout(JSON.stringify(payload, null, 2));
    return;
  }
  for (const workspace of payload.workspaces) {
    options.stdout(
      `${workspace.organization_id}${workspace.name === undefined ? "" : `\t${workspace.name}`}`,
    );
  }
}

/** Persist the selected workspace after verifying it is accessible. */
async function useWorkspace(options: {
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly stdout: (line: string) => void;
  readonly workspaceId: string | undefined;
  readonly now?: (() => Date) | undefined;
}): Promise<void> {
  if (options.workspaceId === undefined || options.workspaceId.length === 0) {
    throw new Error("Workspace id is required");
  }
  const { authClient, accessToken } = await createWorkspaceClient(options);
  const payload = await authClient.listWorkspaces(accessToken);
  if (
    !payload.workspaces.some(
      (workspace) => workspace.organization_id === options.workspaceId,
    )
  ) {
    throw new Error(`Workspace ${options.workspaceId} is not available`);
  }
  await createCliWorkspaceSelection(options.store).setSelectedOrganizationId(
    options.workspaceId,
  );
  options.stdout(`Selected workspace ${options.workspaceId}.`);
}

/** Build an HTTP client authenticated from persisted CLI state. */
async function createCliProductClient(options: {
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly now?: (() => Date) | undefined;
}) {
  const state = await requireAuthState(options.store);
  const authClient = createCliAuthClient({
    apiBaseUrl: state.apiBaseUrl,
    appBaseUrl: state.appBaseUrl,
    fetcher: options.fetcher,
  });
  const accessTokenProvider = createStoredCliAccessTokenProvider({
    store: options.store,
    client: authClient,
    now: options.now,
  });
  return createHyperstarClient({
    config: {
      authMode: "cli",
      apiBaseUrl: state.apiBaseUrl,
      appBaseUrl: state.appBaseUrl,
      accessTokenProvider,
      workspaceSelection: createCliWorkspaceSelection(options.store),
    },
    fetcher: options.fetcher,
  });
}

/** Build workspace-listing dependencies from persisted CLI state. */
async function createWorkspaceClient(options: {
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly now?: (() => Date) | undefined;
}) {
  const state = await requireAuthState(options.store);
  const authClient = createCliAuthClient({
    apiBaseUrl: state.apiBaseUrl,
    appBaseUrl: state.appBaseUrl,
    fetcher: options.fetcher,
  });
  const provider = createStoredCliAccessTokenProvider({
    store: options.store,
    client: authClient,
    now: options.now,
  });
  return {
    state,
    authClient,
    accessToken: await provider.getAccessToken(),
  };
}

/** Require local CLI auth state or explain how to create it. */
async function requireAuthState(store: CliAuthStateStore) {
  const state = await store.read();
  if (state === null) {
    throw new Error("Run `hyperstar login` or set HYPERSTAR_API_KEY");
  }
  return state;
}

/** Print structured payloads as JSON or a compact human string. */
function printPayload(
  payload: JsonValue,
  json: boolean,
  stdout: (line: string) => void,
): void {
  if (json || typeof payload !== "object" || payload === null) {
    stdout(JSON.stringify(payload, null, 2));
    return;
  }
  stdout(JSON.stringify(payload));
}

if (isDirectCliInvocation(import.meta.url, process.argv[1])) {
  void runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
