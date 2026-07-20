import { describe, expect, it, vi } from "vitest";

import type { CliAuthStateStore } from "../src/auth/cli-auth-state.js";
import type {
  LocalCallbackOptions,
  LocalCallbackResult,
  LocalCallbackServer,
} from "../src/auth/local-callback.js";
import {
  createBrowserLoginManager,
  resolveLoginBaseUrls,
} from "../src/auth/browser-login.js";

describe("browser login manager", () => {
  it("starts a no-open login with authorization metadata", async () => {
    const callback = createDeferredCallback();
    const openBrowser = vi.fn(async () => undefined);
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
      openBrowser,
      startCallback: callback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
    });

    const started = await manager.startLogin({ noOpen: true });

    expect(started).toEqual({
      status: "authorization_pending",
      loginId: expect.any(String),
      authorizeUrl:
        "https://app.example.test/cli/authorize?client_id=hyperstar-local-agent&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback&code_challenge=challenge-123&code_challenge_method=S256&state=state-123",
      callbackUrl: "http://127.0.0.1:4321/callback",
      nextTool: "complete_browser_login",
    });
    expect(openBrowser).not.toHaveBeenCalled();
    expect(callback.startedWith).toEqual({ expectedState: "state-123" });
    await callback.closeOpenServer();
  });

  it("exchanges callback codes immediately, clears workspace selection, and persists tokens under the auth lock", async () => {
    const callback = createDeferredCallback();
    const store = createMemoryStore({
      selectedOrganizationId: "org_123",
    });
    const exchangeCode = vi.fn(async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2026-07-14T12:00:00.000Z",
    }));
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store,
      startCallback: callback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
      createClient: () => ({
        buildAuthorizeUrl: (callbackUrl, pkce, state) =>
          new URL(
            `https://app.example.test/cli/authorize?redirect_uri=${encodeURIComponent(callbackUrl)}&code_challenge=${pkce.challenge}&state=${state}`,
          ),
        exchangeCode,
        refresh: vi.fn(),
        logout: vi.fn(),
        listWorkspaces: vi.fn(),
      }),
    });

    const started = await manager.startLogin({ noOpen: true });
    callback.resolve({ code: "code-123", state: "state-123" });
    await waitFor(() => expect(exchangeCode).toHaveBeenCalled());

    expect(exchangeCode).toHaveBeenCalledWith(
      "code-123",
      "verifier-123",
      "http://127.0.0.1:4321/callback",
    );
    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "authenticated",
      nextTool: "list_workspaces",
    });
    expect(store.lockedWrites).toBe(1);
    await expect(store.read()).resolves.toMatchObject({
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    await expect(store.read()).resolves.not.toHaveProperty(
      "selectedOrganizationId",
    );
    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "not_found",
    });
    expect(callback.closedCount).toBe(1);
  });

  it("cancels older pending logins so stale callbacks cannot persist tokens", async () => {
    const firstCallback = createDeferredCallback();
    const secondCallback = createDeferredCallback({
      callbackUrl: "http://127.0.0.1:4322/callback",
    });
    const startCallback = vi
      .fn()
      .mockResolvedValueOnce(firstCallback.server)
      .mockResolvedValueOnce(secondCallback.server);
    const store = createMemoryStore();
    const exchangeCode = vi.fn(async (code: string) => ({
      accessToken: `${code}-access-token`,
      refreshToken: `${code}-refresh-token`,
      accessTokenExpiresAt: "2026-07-14T12:00:00.000Z",
    }));
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store,
      startCallback,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
      createClient: () => ({
        buildAuthorizeUrl: () => new URL("https://app.example.test/auth"),
        exchangeCode,
        refresh: vi.fn(),
        logout: vi.fn(),
        listWorkspaces: vi.fn(),
      }),
    });

    const firstStarted = await manager.startLogin({ noOpen: true });
    const secondStarted = await manager.startLogin({ noOpen: true });

    expect(firstCallback.closedCount).toBe(1);
    await expect(
      manager.completeLogin({ loginId: firstStarted.loginId }),
    ).resolves.toEqual({
      status: "failed",
      error: "A newer Hyperstar browser login was started.",
    });

    firstCallback.resolve({ code: "old-code", state: "state-123" });
    secondCallback.resolve({ code: "new-code", state: "state-123" });
    await expect(
      manager.completeLogin({ loginId: secondStarted.loginId }),
    ).resolves.toEqual({
      status: "authenticated",
      nextTool: "list_workspaces",
    });

    expect(exchangeCode).toHaveBeenCalledTimes(1);
    expect(exchangeCode).toHaveBeenCalledWith(
      "new-code",
      "verifier-123",
      "http://127.0.0.1:4322/callback",
    );
    await expect(store.read()).resolves.toMatchObject({
      accessToken: "new-code-access-token",
      refreshToken: "new-code-refresh-token",
    });
  });

  it("returns authorization pending while callback exchange is not done", async () => {
    const callback = createDeferredCallback();
    const exchange = createDeferredTokenExchange();
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
      startCallback: callback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
      createClient: () => ({
        buildAuthorizeUrl: () => new URL("https://app.example.test/auth"),
        exchangeCode: exchange.exchangeCode,
        refresh: vi.fn(),
        logout: vi.fn(),
        listWorkspaces: vi.fn(),
      }),
    });
    const started = await manager.startLogin({ noOpen: true });
    callback.resolve({ code: "code-123", state: "state-123" });
    await waitFor(() => expect(exchange.exchangeCode).toHaveBeenCalled());

    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "authorization_pending",
      nextTool: "complete_browser_login",
    });

    exchange.resolve({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2026-07-14T12:00:00.000Z",
    });
    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "authenticated",
      nextTool: "list_workspaces",
    });
  });

  it("turns browser denial into a failed session without token exchange", async () => {
    const callback = createDeferredCallback();
    const exchangeCode = vi.fn();
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
      startCallback: callback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
      createClient: () => ({
        buildAuthorizeUrl: () => new URL("https://app.example.test/auth"),
        exchangeCode,
        refresh: vi.fn(),
        logout: vi.fn(),
        listWorkspaces: vi.fn(),
      }),
    });
    const started = await manager.startLogin({ noOpen: true });

    callback.resolve({ error: "access_denied", state: "state-123" });
    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "failed",
      error: "Hyperstar login failed: access_denied",
    });
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(callback.closedCount).toBe(1);
    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "not_found",
    });
  });

  it("cleans up callback timeout failures and exchange failures", async () => {
    const timeoutCallback = createDeferredCallback();
    const timeoutManager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
      startCallback: timeoutCallback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-123",
    });
    const timeoutStarted = await timeoutManager.startLogin({ noOpen: true });

    timeoutCallback.resolve({ error: "timeout" });
    await expect(
      timeoutManager.completeLogin({ loginId: timeoutStarted.loginId }),
    ).resolves.toEqual({
      status: "failed",
      error: "Hyperstar login failed: timeout",
    });
    expect(timeoutCallback.closedCount).toBe(1);

    const exchangeCallback = createDeferredCallback();
    const exchangeManager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
      startCallback: exchangeCallback.start,
      createPkcePair: () => ({
        verifier: "verifier-123",
        challenge: "challenge-123",
      }),
      createState: () => "state-456",
      createClient: () => ({
        buildAuthorizeUrl: () => new URL("https://app.example.test/auth"),
        exchangeCode: vi.fn(async () => {
          throw new Error("token endpoint unavailable");
        }),
        refresh: vi.fn(),
        logout: vi.fn(),
        listWorkspaces: vi.fn(),
      }),
    });
    const exchangeStarted = await exchangeManager.startLogin({ noOpen: true });

    exchangeCallback.resolve({ code: "code-456", state: "state-456" });
    await expect(
      exchangeManager.completeLogin({ loginId: exchangeStarted.loginId }),
    ).resolves.toEqual({
      status: "failed",
      error: "token endpoint unavailable",
    });
    expect(exchangeCallback.closedCount).toBe(1);
    await expect(
      exchangeManager.completeLogin({ loginId: exchangeStarted.loginId }),
    ).resolves.toEqual({
      status: "not_found",
    });
  });

  it("removes stale completed login results before polling", async () => {
    let now = 1_000;
    const callback = createDeferredCallback();
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
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
      now: () => now,
      completedResultTtlMs: 500,
    });
    const started = await manager.startLogin({ noOpen: true });

    callback.resolve({ code: "code-123", state: "state-123" });
    await waitFor(() => expect(callback.closedCount).toBe(1));
    now = 1_501;

    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "not_found",
    });
  });

  it("returns a recent completed login result once before removing it", async () => {
    let now = 1_000;
    const callback = createDeferredCallback();
    const manager = createBrowserLoginManager({
      env: loginEnv(),
      store: createMemoryStore(),
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
      now: () => now,
      completedResultTtlMs: 500,
    });
    const started = await manager.startLogin({ noOpen: true });

    callback.resolve({ code: "code-123", state: "state-123" });
    await waitFor(() => expect(callback.closedCount).toBe(1));
    now = 1_499;

    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "authenticated",
      nextTool: "list_workspaces",
    });
    await expect(
      manager.completeLogin({ loginId: started.loginId }),
    ).resolves.toEqual({
      status: "not_found",
    });
  });

  it("requires an explicit app URL when login targets a custom API", () => {
    expect(() =>
      resolveLoginBaseUrls({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
      }),
    ).toThrow(
      "Set HYPERSTAR_APP_BASE_URL when HYPERSTAR_API_BASE_URL does not use the production Hyperstar API origin",
    );
  });

  it("treats a blank app URL env value as absent for custom API guards", () => {
    expect(() =>
      resolveLoginBaseUrls({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_APP_BASE_URL: "",
      }),
    ).toThrow(
      "Set HYPERSTAR_APP_BASE_URL when HYPERSTAR_API_BASE_URL does not use the production Hyperstar API origin",
    );
  });
});

type MemoryStore = CliAuthStateStore & {
  readonly lockedWrites: number;
};

function loginEnv(): Readonly<Record<string, string | undefined>> {
  return {
    HYPERSTAR_API_BASE_URL: "https://api.example.test",
    HYPERSTAR_APP_BASE_URL: "https://app.example.test",
  };
}

function createMemoryStore(
  overrides: Partial<Awaited<ReturnType<CliAuthStateStore["read"]>>> = {},
): MemoryStore {
  let state: Awaited<ReturnType<CliAuthStateStore["read"]>> = {
    apiBaseUrl: "https://api.example.test",
    appBaseUrl: "https://app.example.test",
    accessToken: "old-access-token",
    refreshToken: "old-refresh-token",
    accessTokenExpiresAt: "2026-07-14T10:00:00.000Z",
    ...overrides,
  };
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
  readonly server: LocalCallbackServer;
  readonly resolve: (result: LocalCallbackResult) => void;
  readonly closeOpenServer: () => Promise<void>;
  readonly closedCount: number;
  readonly startedWith: LocalCallbackOptions | undefined;
};
function createDeferredCallback(
  options: { readonly callbackUrl?: string } = {},
): {
  readonly start: (
    options: LocalCallbackOptions,
  ) => Promise<LocalCallbackServer>;
  readonly server: LocalCallbackServer;
  readonly resolve: (result: LocalCallbackResult) => void;
  readonly closeOpenServer: () => Promise<void>;
  readonly closedCount: number;
  readonly startedWith: LocalCallbackOptions | undefined;
} {
  let resolve!: (result: LocalCallbackResult) => void;
  const result = new Promise<LocalCallbackResult>((settle) => {
    resolve = settle;
  });
  let closedCount = 0;
  let startedWith: LocalCallbackOptions | undefined;
  const server: LocalCallbackServer = {
    callbackUrl: options.callbackUrl ?? "http://127.0.0.1:4321/callback",
    result,
    close: async () => {
      closedCount += 1;
    },
  };
  return {
    start: async (options) => {
      startedWith = options;
      return server;
    },
    server,
    resolve,
    closeOpenServer: async () => {
      await server.close();
    },
    get closedCount() {
      return closedCount;
    },
    get startedWith() {
      return startedWith;
    },
  };
}

function createDeferredTokenExchange(): {
  readonly exchangeCode: ReturnType<typeof vi.fn>;
  readonly resolve: (value: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessTokenExpiresAt: string;
  }) => void;
} {
  let resolve!: (value: {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessTokenExpiresAt: string;
  }) => void;
  const tokenPair = new Promise<{
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly accessTokenExpiresAt: string;
  }>((settle) => {
    resolve = settle;
  });
  return {
    exchangeCode: vi.fn(async () => tokenPair),
    resolve,
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
