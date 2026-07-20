import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import type { CliAuthStateStore } from "../src/auth/cli-auth-state.js";
import type {
  LocalCallbackOptions,
  LocalCallbackResult,
  LocalCallbackServer,
} from "../src/auth/local-callback.js";
import { registerHyperstarAuthTools } from "../src/auth-tools.js";
import { createHyperstarMcpServer } from "../src/server.js";

describe("auth MCP tools", () => {
  it("starts browser login with MCP-facing snake_case output", async () => {
    const callback = createDeferredCallback();
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarAuthTools(server, {
      env: loginEnv(),
      store: createMemoryStore(),
      startCallback: callback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
    });

    const result = await callRegisteredTool(server, "start_browser_login", {
      no_open: true,
    });

    expect(result.structuredContent).toMatchObject({
      status: "authorization_pending",
      login_id: expect.any(String),
      authorize_url:
        "https://app.example.test/cli/authorize?client_id=hyperstar-local-agent&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback&code_challenge=challenge-123&code_challenge_method=S256&state=state-123",
      callback_url: "http://127.0.0.1:4321/callback",
      next_tool: "complete_browser_login",
      next_arguments: { login_id: expect.any(String) },
    });
    expect(String(result.structuredContent.agent_guidance)).toContain(
      "Open authorize_url",
    );
    await callback.closeOpenServer();
  });

  it("reports pending and then authenticated after callback token persistence", async () => {
    const callback = createDeferredCallback();
    const store = createMemoryStore();
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    registerHyperstarAuthTools(server, {
      env: loginEnv(),
      store,
      startCallback: callback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
      createClient: () => ({
        buildAuthorizeUrl: () => new URL("https://app.example.test/auth"),
        exchangeCode: vi.fn(async () => ({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accessTokenExpiresAt: "2026-07-14T12:00:00.000Z",
        })),
        refresh: vi.fn(),
        logout: vi.fn(),
        listWorkspaces: vi.fn(),
      }),
    });
    const started = await callRegisteredTool(server, "start_browser_login", {
      no_open: true,
    });
    const loginId = stringField(started.structuredContent, "login_id");

    await expect(
      callRegisteredTool(server, "complete_browser_login", {
        login_id: loginId,
      }),
    ).resolves.toMatchObject({
      structuredContent: {
        status: "authorization_pending",
        next_tool: "complete_browser_login",
        next_arguments: { login_id: loginId },
      },
    });

    callback.resolve({ code: "code-123", state: "state-123" });
    await waitFor(() => expect(callback.closedCount).toBe(1));

    await expect(
      callRegisteredTool(server, "complete_browser_login", {
        login_id: loginId,
      }),
    ).resolves.toMatchObject({
      structuredContent: {
        status: "authenticated",
        next_tool: "list_workspaces",
      },
    });
    await expect(store.read()).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("reports service-account mode instead of starting browser login", async () => {
    const startCallback = vi.fn(async () => {
      throw new Error("browser login should not start in service-account mode");
    });
    const server = createHyperstarMcpServer(
      {
        authMode: "service_account",
        apiBaseUrl: "https://api.example.test",
        apiKey: "hstar_test.service-account-secret",
      },
      {
        authToolDependencies: {
          env: loginEnv(),
          store: createMemoryStore(),
          startCallback,
        },
      },
    );

    const result = await callRegisteredTool(server, "start_browser_login", {
      no_open: true,
    });

    expect(result.structuredContent).toMatchObject({
      status: "service_account_active",
      auth_mode: "service_account",
      next_tool: "list_workspaces",
      next_arguments: {},
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      "service-account-secret",
    );
    expect(startCallback).not.toHaveBeenCalled();
  });

  it("reports service-account mode instead of completing browser login", async () => {
    const store = createMemoryStore();
    const server = createHyperstarMcpServer(
      {
        authMode: "service_account",
        apiBaseUrl: "https://api.example.test",
        apiKey: "hstar_test.service-account-secret",
      },
      {
        authToolDependencies: {
          env: loginEnv(),
          store,
        },
      },
    );

    const result = await callRegisteredTool(server, "complete_browser_login", {
      login_id: "login-123",
    });

    expect(result.structuredContent).toMatchObject({
      status: "service_account_active",
      auth_mode: "service_account",
      next_tool: "list_workspaces",
      next_arguments: {},
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      "service-account-secret",
    );
    expect(store.lockedWrites).toBe(0);
  });

  it("registers auth tools before workflow tools on the server", () => {
    const server = createHyperstarMcpServer({
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    });

    expect(registeredToolNames(server).slice(0, 5)).toEqual([
      "start_browser_login",
      "complete_browser_login",
      "hyperstar_whoami",
      "list_workspaces",
      "select_workspace",
    ]);
  });
});

type RegisteredToolHandler = (
  input: unknown,
) => Promise<CallToolResult> | CallToolResult;

function registeredToolNames(server: McpServer): string[] {
  const internals = server as unknown as {
    readonly _registeredTools: Record<string, unknown>;
  };
  return Object.keys(internals._registeredTools);
}

async function callRegisteredTool(
  server: McpServer,
  toolName: string,
  input: unknown,
): Promise<CallToolResult> {
  const internals = server as unknown as {
    readonly _registeredTools: Record<
      string,
      { readonly handler: RegisteredToolHandler }
    >;
  };
  return await internals._registeredTools[toolName]!.handler(input);
}

function stringField(
  value: Record<string, unknown> | undefined,
  field: string,
): string {
  const item = value?.[field];
  if (typeof item !== "string") {
    throw new Error(`Expected ${field} to be a string`);
  }
  return item;
}

type MemoryStore = CliAuthStateStore & {
  readonly lockedWrites: number;
};

function loginEnv(): Readonly<Record<string, string | undefined>> {
  return {
    HYPERSTAR_API_BASE_URL: "https://api.example.test",
    HYPERSTAR_APP_BASE_URL: "https://app.example.test",
  };
}

function createMemoryStore(): MemoryStore {
  let state: Awaited<ReturnType<CliAuthStateStore["read"]>> = null;
  let locked = false;
  let lockedWrites = 0;
  return {
    pathOptions: {},
    path: "/tmp/hyperstar-auth.json",
    read: async () => state,
    readSync: () => state,
    write: async (nextState) => {
      if (!locked) {
        throw new Error("write must happen under auth lock");
      }
      lockedWrites += 1;
      state = nextState;
    },
    clear: async () => {
      state = null;
    },
    withExclusiveLock: async (action) => {
      locked = true;
      try {
        return await action();
      } finally {
        locked = false;
      }
    },
    get lockedWrites() {
      return lockedWrites;
    },
  };
}

function createDeferredCallback(): {
  readonly start: (
    options: LocalCallbackOptions,
  ) => Promise<LocalCallbackServer>;
  readonly resolve: (result: LocalCallbackResult) => void;
  readonly closeOpenServer: () => Promise<void>;
  readonly closedCount: number;
} {
  let resolve!: (result: LocalCallbackResult) => void;
  const result = new Promise<LocalCallbackResult>((settle) => {
    resolve = settle;
  });
  let closedCount = 0;
  const server: LocalCallbackServer = {
    callbackUrl: "http://127.0.0.1:4321/callback",
    result,
    close: async () => {
      closedCount += 1;
    },
  };
  return {
    start: async () => server,
    resolve,
    closeOpenServer: async () => {
      await server.close();
    },
    get closedCount() {
      return closedCount;
    },
  };
}

async function waitFor(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 19) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
