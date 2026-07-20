import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import {
  createCliAuthClient,
  tokenPairToAuthState,
  type CliAuthClient,
  type Fetcher,
} from "./cli-auth-client.js";
import type { CliAuthStateStore } from "./cli-auth-state.js";
import {
  startLocalCallbackServer,
  type LocalCallbackOptions,
  type LocalCallbackResult,
  type LocalCallbackServer,
} from "./local-callback.js";
import { createPkcePair, createState, type PkcePair } from "./pkce.js";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_APP_BASE_URL,
  normalizeBaseUrl,
} from "../config.js";

type LoginBaseUrls = {
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
};

type BrowserLoginClientFactoryOptions = LoginBaseUrls & {
  readonly fetcher?: Fetcher | undefined;
};

type BrowserLoginStartHooks = {
  readonly onReady?: (
    metadata: BrowserLoginStartResult,
  ) => void | Promise<void>;
  readonly onBrowserOpenFailed?: (error: unknown) => void | Promise<void>;
};

export type BrowserLoginStartInput = BrowserLoginStartHooks & {
  readonly noOpen?: boolean;
};

export type BrowserLoginStartResult = {
  readonly status: "authorization_pending";
  readonly loginId: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
  readonly nextTool: "complete_browser_login";
};

export type BrowserLoginCompleteInput = {
  readonly loginId: string;
};

export type BrowserLoginCompleteResult =
  | {
      readonly status: "authorization_pending";
      readonly nextTool: "complete_browser_login";
    }
  | {
      readonly status: "authenticated";
      readonly nextTool: "list_workspaces";
    }
  | {
      readonly status: "failed";
      readonly error: string;
    }
  | {
      readonly status: "not_found";
    };

export type BrowserLoginManager = {
  readonly startLogin: (
    input: BrowserLoginStartInput,
  ) => Promise<BrowserLoginStartResult>;
  readonly completeLogin: (
    input: BrowserLoginCompleteInput,
  ) => Promise<BrowserLoginCompleteResult>;
};

export type BrowserLoginManagerDependencies = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly store: CliAuthStateStore;
  readonly fetcher?: Fetcher | undefined;
  readonly now?: (() => number) | undefined;
  readonly completedResultTtlMs?: number | undefined;
  readonly openBrowser?: ((url: URL) => Promise<void>) | undefined;
  readonly startCallback?:
    | ((options: LocalCallbackOptions) => Promise<LocalCallbackServer>)
    | undefined;
  readonly createPkcePair?: (() => PkcePair) | undefined;
  readonly createState?: (() => string) | undefined;
  readonly createClient?:
    ((options: BrowserLoginClientFactoryOptions) => CliAuthClient) | undefined;
};

type PendingSession = {
  readonly loginId: string;
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly pkce: PkcePair;
  readonly callback: LocalCallbackServer;
  readonly client: CliAuthClient;
  completion: Promise<void>;
};

type CompletedSession = {
  readonly result: BrowserLoginCompleteResult;
  readonly completedAt: number;
};

const DEFAULT_COMPLETED_RESULT_TTL_MS = 5 * 60 * 1_000;

/** Create a reusable browser-login workflow manager for CLI and MCP tools. */
export function createBrowserLoginManager(
  dependencies: BrowserLoginManagerDependencies,
): BrowserLoginManager {
  const pendingSessions = new Map<string, PendingSession>();
  const completedSessions = new Map<string, CompletedSession>();
  const now = dependencies.now ?? Date.now;
  const completedResultTtlMs =
    dependencies.completedResultTtlMs ?? DEFAULT_COMPLETED_RESULT_TTL_MS;

  return {
    startLogin: async (input) => {
      cleanupCompletedSessions({
        completedSessions,
        now,
        completedResultTtlMs,
      });
      await cancelPendingSessions({
        pendingSessions,
        completedSessions,
        now,
      });
      const urls = resolveLoginBaseUrls(dependencies.env ?? process.env);
      const pkce =
        dependencies.createPkcePair === undefined
          ? createPkcePair()
          : dependencies.createPkcePair();
      const state =
        dependencies.createState === undefined
          ? createState()
          : dependencies.createState();
      const callback = await (
        dependencies.startCallback ?? startLocalCallbackServer
      )({
        expectedState: state,
      });
      const client = createClient(dependencies, urls);
      const authorizeUrl = client.buildAuthorizeUrl(
        callback.callbackUrl,
        pkce,
        state,
      );
      const loginId = randomUUID();
      const session: PendingSession = {
        loginId,
        apiBaseUrl: urls.apiBaseUrl,
        appBaseUrl: urls.appBaseUrl,
        pkce,
        callback,
        client,
        completion: Promise.resolve(),
      };
      session.completion = processCallbackResult({
        session,
        store: dependencies.store,
        pendingSessions,
        completedSessions,
        now,
      });
      pendingSessions.set(loginId, session);

      const metadata: BrowserLoginStartResult = {
        status: "authorization_pending",
        loginId,
        authorizeUrl: authorizeUrl.toString(),
        callbackUrl: callback.callbackUrl,
        nextTool: "complete_browser_login",
      };
      await input.onReady?.(metadata);
      if (input.noOpen !== true) {
        try {
          await (dependencies.openBrowser ?? openSystemBrowser)(authorizeUrl);
        } catch (error) {
          await input.onBrowserOpenFailed?.(error);
        }
      }
      return metadata;
    },
    completeLogin: async (input) => {
      cleanupCompletedSessions({
        completedSessions,
        now,
        completedResultTtlMs,
      });
      const completed = completedSessions.get(input.loginId);
      if (completed !== undefined) {
        completedSessions.delete(input.loginId);
        return completed.result;
      }
      const pending = pendingSessions.get(input.loginId);
      if (pending === undefined) {
        return { status: "not_found" };
      }
      await Promise.race([
        pending.completion.then(() => true),
        sleep(0).then(() => false),
      ]);
      const completedAfterDrain = completedSessions.get(input.loginId);
      if (completedAfterDrain !== undefined) {
        completedSessions.delete(input.loginId);
        return completedAfterDrain.result;
      }
      return {
        status: "authorization_pending",
        nextTool: "complete_browser_login",
      };
    },
  };
}

/** Resolve the API and browser app base URLs used by browser login. */
export function resolveLoginBaseUrls(
  env: Readonly<Record<string, string | undefined>>,
): LoginBaseUrls {
  const apiBaseUrl = resolveEnvBaseUrl(
    env.HYPERSTAR_API_BASE_URL,
    DEFAULT_API_BASE_URL,
    "HYPERSTAR_API_BASE_URL",
  );
  return {
    apiBaseUrl,
    appBaseUrl: resolveLoginAppBaseUrl(env, apiBaseUrl),
  };
}

/** Resolve and normalize an optional login base URL environment value. */
function resolveEnvBaseUrl(
  rawValue: string | undefined,
  fallback: string,
  envName: string,
): string {
  const value = rawValue?.trim();
  return normalizeBaseUrl(
    value === undefined || value.length === 0 ? fallback : value,
    envName,
  );
}

/** Resolve the browser app URL used by login so auth and token exchange match. */
function resolveLoginAppBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
  apiBaseUrl: string,
): string {
  const rawAppBaseUrl = env.HYPERSTAR_APP_BASE_URL?.trim();
  if (rawAppBaseUrl !== undefined && rawAppBaseUrl.length > 0) {
    return resolveEnvBaseUrl(
      rawAppBaseUrl,
      DEFAULT_APP_BASE_URL,
      "HYPERSTAR_APP_BASE_URL",
    );
  }

  return appBaseUrlForApiBaseUrl(apiBaseUrl);
}

/** Map public Product API origins to their matching frontend origins. */
function appBaseUrlForApiBaseUrl(apiBaseUrl: string): string {
  const origin = new URL(apiBaseUrl).origin;
  if (origin === "https://autopilot.hyper-star.org") {
    return DEFAULT_APP_BASE_URL;
  }
  if (origin === DEFAULT_API_BASE_URL) {
    return DEFAULT_APP_BASE_URL;
  }
  throw new Error(
    "Set HYPERSTAR_APP_BASE_URL when HYPERSTAR_API_BASE_URL does not use the production Hyperstar API origin",
  );
}

/** Create the auth client used for the login session. */
function createClient(
  dependencies: BrowserLoginManagerDependencies,
  urls: LoginBaseUrls,
): CliAuthClient {
  if (dependencies.createClient !== undefined) {
    return dependencies.createClient({
      ...urls,
      fetcher: dependencies.fetcher,
    });
  }
  return createCliAuthClient({
    ...urls,
    fetcher: dependencies.fetcher,
  });
}

/** Exchange callback results, persist auth state, and publish a terminal status. */
async function processCallbackResult(options: {
  readonly session: PendingSession;
  readonly store: CliAuthStateStore;
  readonly pendingSessions: Map<string, PendingSession>;
  readonly completedSessions: Map<string, CompletedSession>;
  readonly now: () => number;
}): Promise<void> {
  try {
    const callbackResult = await options.session.callback.result;
    if (!isPendingSessionActive(options)) {
      return;
    }
    if ("error" in callbackResult) {
      await completeSession(options, {
        status: "failed",
        error: describeCallbackError(callbackResult),
      });
      return;
    }

    await exchangeAndPersistToken(options, callbackResult);
    if (!isPendingSessionActive(options)) {
      return;
    }
    await completeSession(options, {
      status: "authenticated",
      nextTool: "list_workspaces",
    });
  } catch (error) {
    if (!isPendingSessionActive(options)) {
      return;
    }
    await completeSession(options, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Exchange an authorization code immediately and persist the resulting token state. */
async function exchangeAndPersistToken(
  options: {
    readonly session: PendingSession;
    readonly store: CliAuthStateStore;
    readonly pendingSessions: Map<string, PendingSession>;
  },
  callbackResult: Extract<LocalCallbackResult, { readonly code: string }>,
): Promise<void> {
  const tokenPair = await options.session.client.exchangeCode(
    callbackResult.code,
    options.session.pkce.verifier,
    options.session.callback.callbackUrl,
  );
  if (!isPendingSessionActive(options)) {
    return;
  }
  await options.store.withExclusiveLock(async () => {
    if (!isPendingSessionActive(options)) {
      return;
    }
    await options.store.write(
      tokenPairToAuthState(tokenPair, {
        apiBaseUrl: options.session.apiBaseUrl,
        appBaseUrl: options.session.appBaseUrl,
      }),
    );
  });
}

/** Return true only while this session remains the active pending login. */
function isPendingSessionActive(options: {
  readonly session: PendingSession;
  readonly pendingSessions: Map<string, PendingSession>;
}): boolean {
  return (
    options.pendingSessions.get(options.session.loginId) === options.session
  );
}

/** Describe known loopback callback errors without attempting token exchange. */
function describeCallbackError(
  callbackResult: Extract<LocalCallbackResult, { readonly error: string }>,
): string {
  switch (callbackResult.error) {
    case "access_denied":
      return "Hyperstar login failed: access_denied";
    case "missing_code":
      return "Hyperstar login failed: missing_code";
    case "timeout":
      return "Hyperstar login failed: timeout";
    default:
      return `Hyperstar login failed: ${callbackResult.error}`;
  }
}

/** Close and remove a pending session while retaining one pollable terminal result. */
async function completeSession(
  options: {
    readonly session: PendingSession;
    readonly pendingSessions: Map<string, PendingSession>;
    readonly completedSessions: Map<string, CompletedSession>;
    readonly now: () => number;
  },
  result: BrowserLoginCompleteResult,
): Promise<void> {
  try {
    await options.session.callback.close();
  } finally {
    options.pendingSessions.delete(options.session.loginId);
    options.completedSessions.set(options.session.loginId, {
      result,
      completedAt: options.now(),
    });
  }
}

/** Cancel existing login sessions before starting a replacement browser login. */
async function cancelPendingSessions(options: {
  readonly pendingSessions: Map<string, PendingSession>;
  readonly completedSessions: Map<string, CompletedSession>;
  readonly now: () => number;
}): Promise<void> {
  const sessions = [...options.pendingSessions.values()];
  await Promise.all(
    sessions.map((session) =>
      completeSession(
        {
          ...options,
          session,
        },
        {
          status: "failed",
          error: "A newer Hyperstar browser login was started.",
        },
      ),
    ),
  );
}

/** Remove terminal login results after their one-time polling window expires. */
function cleanupCompletedSessions(options: {
  readonly completedSessions: Map<string, CompletedSession>;
  readonly now: () => number;
  readonly completedResultTtlMs: number;
}): void {
  const expiresBefore = options.now() - options.completedResultTtlMs;
  for (const [loginId, session] of options.completedSessions) {
    if (session.completedAt < expiresBefore) {
      options.completedSessions.delete(loginId);
    }
  }
}

/** Open the system browser for the authorization request. */
async function openSystemBrowser(url: URL): Promise<void> {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["/c", "start", "", url.toString()]
      : [url.toString()];
  await new Promise<void>((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", () => resolve());
      child.once("spawn", () => resolve());
      child.unref();
    } catch (error) {
      void error;
      resolve();
    }
  });
}
