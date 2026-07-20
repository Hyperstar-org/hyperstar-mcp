import { redactSecret, type HyperstarMcpConfig } from "./config.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

export class HyperstarApiError extends Error {
  readonly status: number;
  readonly detail: JsonValue;
  readonly retryable: boolean;

  constructor(status: number, detail: JsonValue) {
    super(formatApiErrorMessage(status, detail));
    this.name = "HyperstarApiError";
    this.status = status;
    this.detail = detail;
    this.retryable = status === 429 || status >= 500;
  }
}

export type HyperstarClient = {
  readonly get: (path: string, query?: URLSearchParams) => Promise<JsonValue>;
  readonly post: (
    path: string,
    body?: JsonObject,
    headers?: Record<string, string>,
  ) => Promise<JsonValue>;
  readonly patch: (path: string, body?: JsonObject) => Promise<JsonValue>;
};

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

const MCP_AUTH_CONFIGURATION_MESSAGE =
  "Call start_browser_login, then complete_browser_login and select_workspace, or set HYPERSTAR_API_KEY.";

export function createHyperstarClient(options: {
  readonly config: HyperstarMcpConfig;
  readonly fetcher?: Fetcher | undefined;
}): HyperstarClient {
  const fetcher = options.fetcher ?? fetch;

  async function request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: JsonObject,
    extraHeaders: Record<string, string> = {},
    query?: URLSearchParams,
  ): Promise<JsonValue> {
    const url = buildApiUrl(options.config.apiBaseUrl, path);
    if (query !== undefined) {
      url.search = query.toString();
    }

    const baseHeaders: Record<string, string> = {
      ...extraHeaders,
      accept: "application/json",
    };
    const secretsToRedact: string[] = [];
    let retryCliAccessToken: (() => Promise<string>) | undefined;
    if (options.config.authMode === "unauthenticated") {
      throw new Error(MCP_AUTH_CONFIGURATION_MESSAGE);
    }
    if (options.config.authMode === "service_account") {
      baseHeaders["x-hyperstar-api-key"] = options.config.apiKey;
      secretsToRedact.push(options.config.apiKey);
    } else {
      const requestAuth = await readCliRequestAuth(options.config);
      assertCliRequestAuthMatchesConfig(options.config, requestAuth);
      assertSelectedWorkspace(requestAuth.selectedOrganizationId, path);
      baseHeaders.Authorization = `Bearer ${requestAuth.accessToken}`;
      secretsToRedact.push(
        requestAuth.accessToken,
        `Bearer ${requestAuth.accessToken}`,
      );
      if (requestAuth.selectedOrganizationId !== undefined) {
        baseHeaders["X-Hyperstar-Organization-Id"] =
          requestAuth.selectedOrganizationId;
      }
      retryCliAccessToken = requestAuth.refreshAccessToken;
    }
    const init: RequestInit = { method, headers: baseHeaders };
    if (body !== undefined) {
      baseHeaders["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response = await fetcher(url, init);
    const payload = await readJson(response);
    if (response.status === 401 && retryCliAccessToken !== undefined) {
      const refreshedAccessToken = await retryCliAccessToken();
      const retryHeaders = {
        ...baseHeaders,
        Authorization: `Bearer ${refreshedAccessToken}`,
      };
      secretsToRedact.push(
        refreshedAccessToken,
        `Bearer ${refreshedAccessToken}`,
      );
      response = await fetcher(url, { ...init, headers: retryHeaders });
      const retryPayload = await readJson(response);
      if (response.ok) {
        return retryPayload;
      }
      throw new HyperstarApiError(
        response.status,
        redactSecrets(extractDetail(retryPayload), secretsToRedact),
      );
    }
    if (!response.ok) {
      throw new HyperstarApiError(
        response.status,
        redactSecrets(extractDetail(payload), secretsToRedact),
      );
    }

    return payload;
  }

  return {
    get: (path, query) => request("GET", path, undefined, {}, query),
    post: (path, body, headers) => request("POST", path, body, headers),
    patch: (path, body) => request("PATCH", path, body),
  };
}

/** Read CLI bearer token and workspace as one snapshot when the config supports it. */
async function readCliRequestAuth(
  config: Extract<HyperstarMcpConfig, { readonly authMode: "cli" }>,
): Promise<{
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly accessToken: string;
  readonly selectedOrganizationId?: string;
  readonly refreshAccessToken?: () => Promise<string>;
}> {
  if (config.requestAuthSnapshotProvider !== undefined) {
    return await config.requestAuthSnapshotProvider.getRequestAuthSnapshot();
  }
  const selectedOrganizationId =
    await config.workspaceSelection.getSelectedOrganizationId();
  const accessToken = await config.accessTokenProvider.getAccessToken();
  return cliRequestAuth(
    config.apiBaseUrl,
    config.appBaseUrl,
    accessToken,
    selectedOrganizationId,
    config.accessTokenProvider.refreshAccessToken,
  );
}

/** Build CLI request auth without assigning undefined optional fields. */
function cliRequestAuth(
  apiBaseUrl: string,
  appBaseUrl: string,
  accessToken: string,
  selectedOrganizationId: string | undefined,
  refreshAccessToken: (() => Promise<string>) | undefined,
): {
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly accessToken: string;
  readonly selectedOrganizationId?: string;
  readonly refreshAccessToken?: () => Promise<string>;
} {
  return {
    apiBaseUrl,
    appBaseUrl,
    accessToken,
    ...(selectedOrganizationId === undefined ? {} : { selectedOrganizationId }),
    ...(refreshAccessToken === undefined ? {} : { refreshAccessToken }),
  };
}

/** Refuse to mix one persisted CLI identity with another request origin. */
function assertCliRequestAuthMatchesConfig(
  config: Extract<HyperstarMcpConfig, { readonly authMode: "cli" }>,
  requestAuth: {
    readonly apiBaseUrl: string;
    readonly appBaseUrl: string;
  },
): void {
  if (
    requestAuth.apiBaseUrl === config.apiBaseUrl &&
    requestAuth.appBaseUrl === config.appBaseUrl
  ) {
    return;
  }
  throw new Error(
    "Hyperstar auth changed while preparing the request; call the tool again",
  );
}

function buildApiUrl(apiBaseUrl: string, path: string): URL {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Hyperstar API path must be root-relative");
  }

  const baseUrl = new URL(apiBaseUrl);
  const url = new URL(path, `${apiBaseUrl}/`);
  if (url.origin !== baseUrl.origin) {
    throw new Error("Hyperstar API path must preserve the configured origin");
  }

  return url;
}

/** Require an explicit workspace for CLI-authenticated Product API routes. */
function assertSelectedWorkspace(
  selectedOrganizationId: string | undefined,
  path: string,
): void {
  if (selectedOrganizationId !== undefined || path === "/v1/workspaces") {
    return;
  }
  throw new Error(
    "Run `hyperstar workspaces use <workspace_id>` before calling Product API routes",
  );
}

async function readJson(response: Response): Promise<JsonValue> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function extractDetail(payload: JsonValue): JsonValue {
  if (isJsonObject(payload) && "detail" in payload) {
    return payload.detail;
  }
  return payload;
}

function formatApiErrorMessage(status: number, detail: JsonValue): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (!isJsonObject(detail)) {
    return `Hyperstar API request failed with status ${status}`;
  }

  const error = stringProperty(detail, "error");
  const feature = stringProperty(detail, "feature");
  if (status === 402 && error === "ENTITLEMENT_EXCEEDED") {
    if (feature === "campaign_active") {
      return [
        "Campaign slots are maxed out for this workspace.",
        "Archive or delete an active campaign, increase the campaign_active limit, or select another workspace.",
      ].join(" ");
    }
    if (feature !== undefined) {
      return `Hyperstar entitlement exceeded for ${feature}. Increase the workspace limit or choose a smaller request.`;
    }
    return "Hyperstar entitlement exceeded. Increase the workspace limit or choose a smaller request.";
  }

  const message = stringProperty(detail, "message");
  if (message !== undefined && message.trim().length > 0) {
    return message;
  }
  return `Hyperstar API request failed with status ${status}`;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringProperty(value: JsonObject, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" ? item : undefined;
}

function redactSecrets(
  value: JsonValue,
  secrets: readonly string[],
): JsonValue {
  if (typeof value === "string") {
    return secrets.reduce(
      (redacted, secret) => redacted.split(secret).join(redactSecret(secret)),
      value,
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, secrets));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redactSecrets(key, secrets),
        redactSecrets(item, secrets),
      ]),
    ) as JsonObject;
  }

  return value;
}
