import { z } from "zod";

export type HostedConfig = {
  readonly issuer: string;
  readonly resource: string;
  readonly jwksUrl: string;
  readonly apiBaseUrl: string;
  readonly edgeSecret: string;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly port: number;
  readonly expandedScopesEnabled?: boolean;
  readonly usageScopeEnabled?: boolean;
};

export const HOSTED_SCOPES = [
  "search:read",
  "campaigns:read",
  "campaigns:write",
  "bulk_email:write",
  "inbox:read",
  "inbox:write",
] as const;

export const EXPANDED_SCOPES = [
  ...HOSTED_SCOPES,
  "performance:read",
  "forms:read",
  "forms:write",
] as const;

export const RECOGNIZED_SCOPES = [...EXPANDED_SCOPES, "usage:read"] as const;

export const advertisedScopes = (config: HostedConfig) =>
  config.usageScopeEnabled
    ? RECOGNIZED_SCOPES
    : config.expandedScopesEnabled
      ? EXPANDED_SCOPES
      : HOSTED_SCOPES;

const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      !/[\s\\]/.test(value)
    );
  }, "Expected a canonical HTTPS URL");

export function readHostedConfig(
  env: Readonly<Record<string, string | undefined>>,
): HostedConfig {
  // Parse only hosted settings. Local API keys, token files and workspace state are irrelevant.
  const parsed = z
    .object({
      MCP_ISSUER: httpsUrl,
      MCP_RESOURCE_URL: httpsUrl,
      MCP_JWKS_URL: httpsUrl,
      MCP_API_BASE_URL: httpsUrl,
      MCP_EDGE_SECRET: z
        .string()
        .min(32)
        .max(512)
        .regex(/^[\x21-\x7e]+$/),
      MCP_ALLOWED_ORIGINS: z
        .string()
        .default("https://claude.ai,https://claude.com,https://chatgpt.com"),
      MCP_USAGE_SCOPE_ENABLED: z.enum(["true", "false"]).default("false"),
      MCP_EXPANDED_SCOPES_ENABLED: z.enum(["true", "false"]).default("false"),
      PORT: z.string().regex(/^\d+$/).default("8080"),
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Error(
      "Invalid hosted MCP configuration: " +
        parsed.error.issues.map((issue) => issue.path.join(".")).join(", "),
    );
  const value = parsed.data;
  if (
    value.MCP_USAGE_SCOPE_ENABLED === "true" &&
    value.MCP_EXPANDED_SCOPES_ENABLED !== "true"
  )
    throw new Error("Usage scope requires expanded scopes");
  if (
    new URL(value.MCP_ISSUER).origin !== value.MCP_ISSUER ||
    value.MCP_API_BASE_URL !== value.MCP_ISSUER ||
    value.MCP_JWKS_URL !== value.MCP_ISSUER + "/oauth/jwks.json" ||
    new URL(value.MCP_RESOURCE_URL).pathname !== "/mcp"
  ) {
    throw new Error(
      "Hosted MCP issuer, Product API, JWKS and resource URLs do not agree",
    );
  }
  const allowedOrigins = new Set(value.MCP_ALLOWED_ORIGINS.split(","));
  for (const origin of allowedOrigins) {
    if (
      !httpsUrl.safeParse(origin).success ||
      new URL(origin).origin !== origin
    )
      throw new Error("Invalid hosted MCP allowed origin");
  }
  const port = Number(value.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid hosted MCP port");
  return {
    issuer: value.MCP_ISSUER,
    resource: value.MCP_RESOURCE_URL,
    jwksUrl: value.MCP_JWKS_URL,
    apiBaseUrl: value.MCP_API_BASE_URL,
    edgeSecret: value.MCP_EDGE_SECRET,
    allowedOrigins,
    port,
    expandedScopesEnabled: value.MCP_EXPANDED_SCOPES_ENABLED === "true",
    usageScopeEnabled: value.MCP_USAGE_SCOPE_ENABLED === "true",
  };
}
