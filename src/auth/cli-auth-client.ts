import {
  createAuthSessionId,
  type CliAuthState,
  type CliAuthStateStore,
} from "./cli-auth-state.js";
import type { PkcePair } from "./pkce.js";

export const CLI_CLIENT_ID = "hyperstar-local-agent";

export type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export type CliTokenPair = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: string;
};

export type Workspace = {
  readonly organization_id: string;
  readonly name?: string;
};

export type WorkspaceList = {
  readonly workspaces: readonly Workspace[];
};

type LoopbackRedirect = {
  readonly host: "ipv4" | "localhost";
  readonly port: number;
};

export type CliAuthClient = {
  readonly buildAuthorizeUrl: (
    callbackUrl: string,
    pkce: PkcePair,
    state: string,
  ) => URL;
  readonly exchangeCode: (
    code: string,
    verifier: string,
    redirectUri: string,
  ) => Promise<CliTokenPair>;
  readonly refresh: (refreshToken: string) => Promise<CliTokenPair>;
  readonly logout: (refreshToken: string) => Promise<void>;
  readonly listWorkspaces: (accessToken: string) => Promise<WorkspaceList>;
};

export type CliAccessTokenProvider = {
  readonly getAccessToken: () => Promise<string>;
  readonly refreshAccessToken?: () => Promise<string>;
};

export type CliRequestAuthSnapshot = {
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly accessToken: string;
  readonly selectedOrganizationId?: string;
  readonly refreshAccessToken?: () => Promise<string>;
};

export type CliRequestAuthSnapshotProvider = {
  readonly getRequestAuthSnapshot: () => Promise<CliRequestAuthSnapshot>;
};

export type CliAuthClientOptions = {
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly fetcher?: Fetcher | undefined;
  readonly now?: (() => Date) | undefined;
};

/** Create a client for the backend CLI auth routes. */
export function createCliAuthClient(
  options: CliAuthClientOptions,
): CliAuthClient {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    buildAuthorizeUrl: (callbackUrl, pkce, state) =>
      buildAuthorizeUrl(options.appBaseUrl, callbackUrl, pkce, state),
    exchangeCode: async (code, verifier, redirectUri) =>
      requestToken(fetcher, options.apiBaseUrl, now, {
        code,
        code_verifier: verifier,
        client_id: CLI_CLIENT_ID,
        loopback_redirect: toLoopbackRedirect(redirectUri),
      }),
    refresh: async (refreshToken) =>
      requestRefresh(fetcher, options.apiBaseUrl, now, {
        refresh_token: refreshToken,
      }),
    logout: async (refreshToken) => {
      const response = await fetcher(
        buildApiUrl(options.apiBaseUrl, "/api/v1/cli-auth/logout"),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Hyperstar logout failed with status ${response.status}`,
        );
      }
    },
    listWorkspaces: async (accessToken) => {
      const response = await fetcher(
        buildApiUrl(options.apiBaseUrl, "/v1/workspaces"),
        {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(
          `Hyperstar workspace request failed with status ${response.status}`,
        );
      }
      return parseWorkspaceList(payload);
    },
  };
}

export type StoredCliAccessTokenProviderOptions = {
  readonly store: CliAuthStateStore;
  readonly client: CliAuthClient;
  readonly now?: (() => Date) | undefined;
};

/** Create an access-token provider that refreshes expired persisted CLI tokens. */
export function createStoredCliAccessTokenProvider(
  options: StoredCliAccessTokenProviderOptions,
): CliAccessTokenProvider {
  let pendingRefresh: Promise<string> | null = null;

  const runExclusiveRefresh = (force: boolean): Promise<string> => {
    if (pendingRefresh !== null) {
      return pendingRefresh;
    }
    pendingRefresh = readOrRefreshAccessToken(options, force).finally(() => {
      pendingRefresh = null;
    });
    return pendingRefresh;
  };

  return {
    getAccessToken: async () => runExclusiveRefresh(false),
    refreshAccessToken: async () => runExclusiveRefresh(true),
  };
}

/** Create request auth snapshots from one locked persisted CLI auth state read. */
export function createStoredCliRequestAuthSnapshotProvider(
  options: StoredCliAccessTokenProviderOptions,
): CliRequestAuthSnapshotProvider {
  return {
    getRequestAuthSnapshot: async () => {
      return await options.store.withExclusiveLock(async () => {
        const state = await readOrRefreshAuthStateLocked(options, false);
        const principalFingerprint = authPrincipalFingerprint(state);
        return cliRequestAuthSnapshot(
          state,
          async () =>
            await refreshAccessTokenForPrincipal(options, principalFingerprint),
        );
      });
    },
  };
}

/** Read a valid access token or refresh persisted CLI auth state. */
async function readOrRefreshAccessToken(
  options: StoredCliAccessTokenProviderOptions,
  forceRefresh: boolean,
): Promise<string> {
  return options.store.withExclusiveLock(() =>
    readOrRefreshAccessTokenLocked(options, forceRefresh),
  );
}

/** Read or refresh persisted CLI auth state while holding the store lock. */
async function readOrRefreshAccessTokenLocked(
  options: StoredCliAccessTokenProviderOptions,
  forceRefresh: boolean,
): Promise<string> {
  return (await readOrRefreshAuthStateLocked(options, forceRefresh))
    .accessToken;
}

/** Read or refresh persisted CLI auth state while the caller holds the store lock. */
async function readOrRefreshAuthStateLocked(
  options: StoredCliAccessTokenProviderOptions,
  forceRefresh: boolean,
): Promise<CliAuthState> {
  const now = options.now ?? (() => new Date());
  const state = await options.store.read();
  if (state === null) {
    throw new Error("Run `hyperstar login` or set HYPERSTAR_API_KEY");
  }
  if (!forceRefresh && !isNearExpiry(state.accessTokenExpiresAt, now())) {
    return await ensureAuthSessionId(options.store, state);
  }

  return refreshAndStore(
    options,
    await ensureAuthSessionId(options.store, state),
  );
}

/** Build the browser authorization URL for local CLI login. */
function buildAuthorizeUrl(
  appBaseUrl: string,
  callbackUrl: string,
  pkce: PkcePair,
  state: string,
): URL {
  const url = new URL("/cli/authorize", `${appBaseUrl}/`);
  url.searchParams.set("client_id", CLI_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url;
}

/** Exchange an authorization or refresh grant for CLI tokens. */
async function requestToken(
  fetcher: Fetcher,
  apiBaseUrl: string,
  now: () => Date,
  body: Record<string, unknown>,
): Promise<CliTokenPair> {
  const response = await fetcher(
    buildApiUrl(apiBaseUrl, "/api/v1/cli-auth/token"),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      `Hyperstar token request failed with status ${response.status}`,
    );
  }
  return parseTokenPair(payload, now);
}

/** Convert the local callback URL to the API-safe descriptor. */
function toLoopbackRedirect(redirectUri: string): LoopbackRedirect {
  const url = new URL(redirectUri);
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    url.pathname !== "/callback" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  ) {
    throw new Error("Hyperstar CLI callback URL was invalid");
  }
  return {
    host: url.hostname === "127.0.0.1" ? "ipv4" : "localhost",
    port,
  };
}

/** Rotate a refresh token using the backend refresh route. */
async function requestRefresh(
  fetcher: Fetcher,
  apiBaseUrl: string,
  now: () => Date,
  body: Record<string, string>,
): Promise<CliTokenPair> {
  const response = await fetcher(
    buildApiUrl(apiBaseUrl, "/api/v1/cli-auth/refresh"),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      `Hyperstar refresh request failed with status ${response.status}`,
    );
  }
  return parseTokenPair(payload, now);
}

/** Build a root-relative API URL. */
function buildApiUrl(apiBaseUrl: string, path: string): URL {
  return new URL(path, `${apiBaseUrl}/`);
}

/** Parse response JSON, preserving empty bodies as null. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

/** Parse backend token payloads into local camelCase state. */
function parseTokenPair(payload: unknown, now: () => Date): CliTokenPair {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "access_token" in payload &&
    "refresh_token" in payload &&
    "expires_in" in payload &&
    typeof payload.access_token === "string" &&
    typeof payload.refresh_token === "string" &&
    typeof payload.expires_in === "number" &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in > 0
  ) {
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      accessTokenExpiresAt: new Date(
        now().getTime() + payload.expires_in * 1_000,
      ).toISOString(),
    };
  }
  throw new Error("Hyperstar token response was invalid");
}

/** Refresh an expired access token and persist the rotated token pair. */
async function refreshAndStore(
  options: StoredCliAccessTokenProviderOptions,
  state: CliAuthState,
): Promise<CliAuthState> {
  const tokenPair = await options.client.refresh(state.refreshToken);
  const nextState = {
    ...state,
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
  };
  await options.store.write(nextState);
  return nextState;
}

/** Backfill a stable auth session id for older local auth states. */
async function ensureAuthSessionId(
  store: CliAuthStateStore,
  state: CliAuthState,
): Promise<CliAuthState> {
  if (state.authSessionId !== undefined) {
    return state;
  }
  const nextState = {
    ...state,
    authSessionId: createAuthSessionId(),
  };
  await store.write(nextState);
  return nextState;
}

/** Refresh only if the persisted auth principal still matches the request. */
async function refreshAccessTokenForPrincipal(
  options: StoredCliAccessTokenProviderOptions,
  expectedPrincipalFingerprint: string,
): Promise<string> {
  return options.store.withExclusiveLock(async () => {
    const state = await options.store.read();
    if (state === null) {
      throw new Error("Run `hyperstar login` or set HYPERSTAR_API_KEY");
    }
    if (authPrincipalFingerprint(state) !== expectedPrincipalFingerprint) {
      throw new Error(
        "Hyperstar auth changed while retrying the request; call the tool again",
      );
    }
    return (await refreshAndStore(options, state)).accessToken;
  });
}

/** Fingerprint the user principal without including the rotating access token. */
function authPrincipalFingerprint(state: CliAuthState): string {
  return JSON.stringify({
    apiBaseUrl: state.apiBaseUrl,
    appBaseUrl: state.appBaseUrl,
    authSessionId: state.authSessionId,
  });
}

/** Build a request auth snapshot without undefined optional properties. */
function cliRequestAuthSnapshot(
  state: CliAuthState,
  refreshAccessToken: () => Promise<string>,
): CliRequestAuthSnapshot {
  return state.selectedOrganizationId === undefined
    ? {
        apiBaseUrl: state.apiBaseUrl,
        appBaseUrl: state.appBaseUrl,
        accessToken: state.accessToken,
        refreshAccessToken,
      }
    : {
        apiBaseUrl: state.apiBaseUrl,
        appBaseUrl: state.appBaseUrl,
        accessToken: state.accessToken,
        selectedOrganizationId: state.selectedOrganizationId,
        refreshAccessToken,
      };
}

/** Parse backend workspace list payloads. */
function parseWorkspaceList(payload: unknown): WorkspaceList {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "workspaces" in payload &&
    Array.isArray(payload.workspaces)
  ) {
    return {
      workspaces: payload.workspaces.map(parseWorkspace),
    };
  }
  throw new Error("Hyperstar workspace response was invalid");
}

/** Parse one workspace record from the backend. */
function parseWorkspace(payload: unknown): Workspace {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "organization_id" in payload &&
    typeof payload.organization_id === "string"
  ) {
    return {
      organization_id: payload.organization_id,
      ...("name" in payload && typeof payload.name === "string"
        ? { name: payload.name }
        : {}),
    };
  }
  throw new Error("Hyperstar workspace response was invalid");
}

/** Return true when a token expires within the refresh window. */
function isNearExpiry(expiresAt: string, now: Date): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }
  return expiresAtMs - now.getTime() <= 60_000;
}

/** Convert a token pair into persisted CLI auth state. */
export function tokenPairToAuthState(
  tokenPair: CliTokenPair,
  options: {
    readonly apiBaseUrl: string;
    readonly appBaseUrl: string;
  },
): CliAuthState {
  return {
    apiBaseUrl: options.apiBaseUrl,
    appBaseUrl: options.appBaseUrl,
    authSessionId: createAuthSessionId(),
    refreshToken: tokenPair.refreshToken,
    accessToken: tokenPair.accessToken,
    accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
  };
}
