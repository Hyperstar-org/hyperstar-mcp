import {
  createCliAuthClient,
  createStoredCliAccessTokenProvider,
  createStoredCliRequestAuthSnapshotProvider,
  type CliAccessTokenProvider,
  type CliRequestAuthSnapshotProvider,
  type Fetcher,
} from "./auth/cli-auth-client.js";
import {
  createAuthSessionId,
  createFileCliAuthStateStore,
  type CliAuthStateStore,
} from "./auth/cli-auth-state.js";

export type ServiceAccountConfig = {
  readonly authMode: "service_account";
  readonly apiBaseUrl: string;
  readonly apiKey: string;
};

export type CliConfig = {
  readonly authMode: "cli";
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly accessTokenProvider: CliAccessTokenProvider;
  readonly requestAuthSnapshotProvider?: CliRequestAuthSnapshotProvider;
  readonly workspaceSelection: CliWorkspaceSelection;
};

export type UnauthenticatedConfig = {
  readonly authMode: "unauthenticated";
  readonly apiBaseUrl: string;
};

export type HyperstarMcpConfig =
  ServiceAccountConfig | CliConfig | UnauthenticatedConfig;

export type Env = Readonly<Record<string, string | undefined>>;

export type CliWorkspaceSelection = {
  readonly getSelectedOrganizationId: () => Promise<string | undefined>;
  readonly getAuthStateFingerprint?: () => Promise<string | undefined>;
  readonly setSelectedOrganizationId: (
    organizationId: string,
    options?: {
      readonly expectedAuthStateFingerprint?: string | undefined;
    },
  ) => Promise<void>;
};

export const DEFAULT_API_BASE_URL = "https://autopilot.hyper-star.org";
export const DEFAULT_APP_BASE_URL = "https://app.hyper-star.org";
export const AUTH_CONFIGURATION_MESSAGE =
  "Run `hyperstar login` or set HYPERSTAR_API_KEY";

export type LoadConfigOptions = {
  readonly env?: Env;
  readonly fetcher?: Fetcher | undefined;
  readonly now?: (() => Date) | undefined;
};

/** Load MCP configuration from env or persisted CLI auth state. */
export function loadConfig(
  options: Env | LoadConfigOptions = process.env,
): HyperstarMcpConfig {
  const loadOptions = isLoadConfigOptions(options) ? options : { env: options };
  const env = loadOptions.env ?? process.env;
  const fetcher = loadOptions.fetcher;
  const now = loadOptions.now;
  const apiKey = env.HYPERSTAR_API_KEY?.trim();
  const rawBaseUrl = env.HYPERSTAR_API_BASE_URL?.trim() ?? DEFAULT_API_BASE_URL;
  const apiBaseUrl = normalizeBaseUrl(
    rawBaseUrl.length === 0 ? DEFAULT_API_BASE_URL : rawBaseUrl,
    "HYPERSTAR_API_BASE_URL",
  );
  if (apiKey !== undefined && apiKey.length > 0) {
    if (!isValidApiKeyHeaderValue(apiKey)) {
      throw new Error("HYPERSTAR_API_KEY contains unsupported characters");
    }

    return {
      authMode: "service_account",
      apiBaseUrl,
      apiKey,
    };
  }

  const store = createFileCliAuthStateStore({ env });
  const state = store.readSync();
  if (state === null) {
    throw new Error(AUTH_CONFIGURATION_MESSAGE);
  }
  const stateApiBaseUrl = normalizeBaseUrl(
    state.apiBaseUrl,
    "stored Hyperstar auth API base URL",
  );
  const rawCliApiBaseUrl = env.HYPERSTAR_API_BASE_URL?.trim();
  const cliApiBaseUrl = normalizeBaseUrl(
    rawCliApiBaseUrl === undefined || rawCliApiBaseUrl.length === 0
      ? stateApiBaseUrl
      : rawCliApiBaseUrl,
    "HYPERSTAR_API_BASE_URL",
  );
  if (rawCliApiBaseUrl !== undefined && rawCliApiBaseUrl.length > 0) {
    assertCliApiBaseUrlMatchesState(cliApiBaseUrl, stateApiBaseUrl);
  }
  const rawCliAppBaseUrl = env.HYPERSTAR_APP_BASE_URL?.trim();
  const cliAppBaseUrl = normalizeBaseUrl(
    rawCliAppBaseUrl === undefined || rawCliAppBaseUrl.length === 0
      ? state.appBaseUrl
      : rawCliAppBaseUrl,
    "HYPERSTAR_APP_BASE_URL",
  );
  const client = createCliAuthClient({
    apiBaseUrl: cliApiBaseUrl,
    appBaseUrl: cliAppBaseUrl,
    fetcher,
  });

  return {
    authMode: "cli",
    apiBaseUrl: cliApiBaseUrl,
    appBaseUrl: cliAppBaseUrl,
    accessTokenProvider: createStoredCliAccessTokenProvider({
      store,
      client,
      now,
    }),
    requestAuthSnapshotProvider: createStoredCliRequestAuthSnapshotProvider({
      store,
      client,
      now,
    }),
    workspaceSelection: createCliWorkspaceSelection(store),
  };
}

/** Load config for MCP server startup, allowing unauthenticated discovery. */
export function loadServerConfig(
  options: Env | LoadConfigOptions = process.env,
): HyperstarMcpConfig {
  try {
    return loadConfig(options);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== AUTH_CONFIGURATION_MESSAGE
    ) {
      throw error;
    }
    const loadOptions = isLoadConfigOptions(options)
      ? options
      : { env: options };
    const env = loadOptions.env ?? process.env;
    const rawBaseUrl =
      env.HYPERSTAR_API_BASE_URL?.trim() ?? DEFAULT_API_BASE_URL;
    const apiBaseUrl = normalizeBaseUrl(
      rawBaseUrl.length === 0 ? DEFAULT_API_BASE_URL : rawBaseUrl,
      "HYPERSTAR_API_BASE_URL",
    );
    return {
      authMode: "unauthenticated",
      apiBaseUrl,
    };
  }
}

/** Create the local CLI workspace-selection port backed by auth state. */
export function createCliWorkspaceSelection(
  store: CliAuthStateStore,
): CliWorkspaceSelection {
  return {
    getSelectedOrganizationId: async () =>
      (await store.read())?.selectedOrganizationId,
    getAuthStateFingerprint: async () => {
      const state = await store.withExclusiveLock(async () => {
        const currentState = await store.read();
        if (currentState === null || currentState.authSessionId !== undefined) {
          return currentState;
        }
        const nextState = {
          ...currentState,
          authSessionId: createAuthSessionId(),
        };
        await store.write(nextState);
        return nextState;
      });
      return state === null ? undefined : authStateFingerprint(state);
    },
    setSelectedOrganizationId: async (organizationId, options = {}) => {
      await store.withExclusiveLock(async () => {
        const state = await store.read();
        if (state === null) {
          throw new Error(AUTH_CONFIGURATION_MESSAGE);
        }
        if (
          options.expectedAuthStateFingerprint !== undefined &&
          authStateFingerprint(state) !== options.expectedAuthStateFingerprint
        ) {
          throw new Error(
            "Hyperstar auth changed while selecting the workspace; run list_workspaces again",
          );
        }
        await store.write({
          ...state,
          selectedOrganizationId: organizationId,
        });
      });
    },
  };
}

/** Fingerprint the stable CLI principal so workspace selection cannot race login. */
function authStateFingerprint(state: {
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly authSessionId?: string;
}): string {
  return JSON.stringify({
    apiBaseUrl: state.apiBaseUrl,
    appBaseUrl: state.appBaseUrl,
    authSessionId: state.authSessionId,
  });
}

/** Return true when loadConfig received its structured options object. */
function isLoadConfigOptions(
  options: Env | LoadConfigOptions,
): options is LoadConfigOptions {
  return "env" in options || "fetcher" in options || "now" in options;
}

/** Redact an API key or bearer token for error messages. */
export function redactSecret(value: string): string {
  const separatorIndex = value.indexOf(".");
  if (separatorIndex <= 0) {
    return "[redacted]";
  }

  return `${value.slice(0, separatorIndex)}.[redacted]`;
}

/** Return true when the key can be safely used as one HTTP header value. */
function isValidApiKeyHeaderValue(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value);
}

/** Refuse to send persisted CLI tokens to a different API base URL. */
function assertCliApiBaseUrlMatchesState(
  requestedApiBaseUrl: string,
  stateApiBaseUrl: string,
): void {
  if (requestedApiBaseUrl === stateApiBaseUrl) {
    return;
  }
  throw new Error(
    "Run `hyperstar login` again before changing HYPERSTAR_API_BASE_URL",
  );
}

/** Normalize an env-provided base URL. */
export function normalizeBaseUrl(rawBaseUrl: string, envName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error(`${envName} must be a valid URL`);
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error(`${envName} must not include credentials`);
  }

  const isHttps = parsed.protocol === "https:";
  const isLocalhostHttp =
    parsed.protocol === "http:" && parsed.hostname === "localhost";
  if (!isHttps && !isLocalhostHttp) {
    throw new Error(
      `${envName} must use HTTPS, except localhost development URLs`,
    );
  }

  return parsed.toString().replace(/\/+$/, "");
}
