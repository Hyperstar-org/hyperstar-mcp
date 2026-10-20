export type ServiceAccountConfig = {
  readonly authMode: "service_account";
  readonly apiBaseUrl: string;
  readonly apiKey: string;
};

export type UnauthenticatedConfig = {
  readonly authMode: "unauthenticated";
  readonly apiBaseUrl: string;
};

export type HyperstarMcpConfig = ServiceAccountConfig | UnauthenticatedConfig;

export type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_API_BASE_URL = "https://autopilot.hyper-star.org";
export const HOSTED_CONNECTOR_URL = "https://mcp.hyper-star.org/mcp";
export const AUTH_CONFIGURATION_MESSAGE = `Set HYPERSTAR_API_KEY to a Hyperstar service-account API key (Team -> API keys), or connect through the hosted connector at ${HOSTED_CONNECTOR_URL} to act as yourself.`;

/** Load MCP configuration from the environment; the API key decides the workspace. */
export function loadConfig(env: Env = process.env): HyperstarMcpConfig {
  const apiKey = env.HYPERSTAR_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(AUTH_CONFIGURATION_MESSAGE);
  }
  if (!isValidApiKeyHeaderValue(apiKey)) {
    throw new Error("HYPERSTAR_API_KEY contains unsupported characters");
  }
  return {
    authMode: "service_account",
    apiBaseUrl: apiBaseUrlFromEnv(env),
    apiKey,
  };
}

/** Load config for MCP server startup, allowing unauthenticated discovery. */
export function loadServerConfig(env: Env = process.env): HyperstarMcpConfig {
  try {
    return loadConfig(env);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== AUTH_CONFIGURATION_MESSAGE
    ) {
      throw error;
    }
    return { authMode: "unauthenticated", apiBaseUrl: apiBaseUrlFromEnv(env) };
  }
}

/** Redact an API key or bearer token for error messages. */
export function redactSecret(value: string): string {
  const separatorIndex = value.indexOf(".");
  if (separatorIndex <= 0) {
    return "[redacted]";
  }

  return `${value.slice(0, separatorIndex)}.[redacted]`;
}

function apiBaseUrlFromEnv(env: Env): string {
  const rawBaseUrl = env.HYPERSTAR_API_BASE_URL?.trim() ?? DEFAULT_API_BASE_URL;
  return normalizeBaseUrl(
    rawBaseUrl.length === 0 ? DEFAULT_API_BASE_URL : rawBaseUrl,
    "HYPERSTAR_API_BASE_URL",
  );
}

/** Return true when the key can be safely used as one HTTP header value. */
function isValidApiKeyHeaderValue(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value);
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
