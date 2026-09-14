import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import {
  createHyperstarClient,
  HyperstarApiError,
  type HyperstarClient,
} from "../http.js";
import { WhoamiResponseSchema } from "../schemas.js";
import {
  HostedAuthorizationError,
  type HostedIdentity,
  type HostedTokenVerifier,
} from "./auth.js";
import { advertisedScopes, type HostedConfig } from "./config.js";
import { createHostedMcpServer } from "./server.js";

export type HostedLogEvent = {
  readonly event: "request" | "origin_rejected";
  readonly status: number;
  readonly grantId?: string;
  readonly clientId?: string;
};
export type HostedHandlerOptions = {
  readonly config: HostedConfig;
  readonly verify: HostedTokenVerifier;
  readonly fetcher?: (input: URL, init: RequestInit) => Promise<Response>;
  readonly log?: (event: HostedLogEvent) => void;
};

export function createHostedHandler(
  options: HostedHandlerOptions,
): (request: Request) => Promise<Response> {
  const { config } = options;
  const metadataUrl = new URL(
    "/.well-known/oauth-protected-resource/mcp",
    config.resource,
  ).href;
  const scope = [...advertisedScopes(config)].sort().join(" ");
  const challenge = (invalid = false) =>
    `Bearer resource_metadata="${metadataUrl}", scope="${scope}"${invalid ? ', error="invalid_token"' : ""}`;

  return async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ status: "ok" });
    const metadata =
      path === "/.well-known/oauth-protected-resource" ||
      path === "/.well-known/oauth-protected-resource/mcp";
    if (!metadata && path !== "/mcp")
      return Response.json({ error: "not_found" }, { status: 404 });
    const origin = request.headers.get("origin");
    if (!metadata && origin !== null && !config.allowedOrigins.has(origin)) {
      options.log?.({ event: "origin_rejected", status: 403 });
      return Response.json({ error: "origin_not_allowed" }, { status: 403 });
    }
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      Vary: "Origin",
    });
    if (metadata) headers.set("Access-Control-Allow-Origin", "*");
    else if (origin !== null)
      headers.set("Access-Control-Allow-Origin", origin);
    const respond = (
      status: number,
      error: string,
      authenticate?: string,
    ): Response => {
      if (authenticate !== undefined)
        headers.set("WWW-Authenticate", authenticate);
      if (status === 503) headers.set("Retry-After", "1");
      return Response.json({ error }, { status, headers });
    };
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (metadata) {
      if (request.method !== "GET") return respond(405, "method_not_allowed");
      return Response.json(
        {
          resource: config.resource,
          authorization_servers: [config.issuer],
          scopes_supported: [...advertisedScopes(config)],
          bearer_methods_supported: ["header"],
          resource_name: "Hyperstar",
          resource_documentation: "https://app.hyper-star.org/mcp",
        },
        { headers },
      );
    }
    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return respond(405, "method_not_allowed");
    }
    const bearer = /^Bearer ([^\s,]+)$/i.exec(
      request.headers.get("authorization") ?? "",
    )?.[1];
    if (bearer === undefined)
      return respond(401, "authentication_required", challenge());
    let identity: HostedIdentity;
    try {
      identity = await options.verify(bearer);
    } catch (error) {
      return error instanceof HostedAuthorizationError && error.status === 401
        ? respond(401, "invalid_token", challenge(true))
        : respond(503, "temporarily_unavailable");
    }
    let unauthorized = false;
    const client = createHyperstarClient({
      config: {
        authMode: "hosted",
        apiBaseUrl: config.apiBaseUrl,
        bearerToken: bearer,
        edgeSecret: config.edgeSecret,
        signal: request.signal,
        onUnauthorized: () => {
          unauthorized = true;
        },
      },
      fetcher: options.fetcher,
    });
    try {
      await preflight(client, identity);
    } catch (error) {
      if (
        unauthorized ||
        (error instanceof HyperstarApiError && error.status === 401)
      )
        return respond(401, "invalid_token", challenge(true));
      if (error instanceof HyperstarApiError && error.status === 403)
        return respond(403, "workspace_access_denied");
      return respond(503, "temporarily_unavailable");
    }
    const server = createHostedMcpServer(
      client,
      config.apiBaseUrl,
      config.expandedScopesEnabled ?? false,
      config.usageScopeEnabled ?? false,
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      const result = await transport.handleRequest(request);
      // Buffer before committing HTTP headers so a post-preflight API 401 starts client reauth.
      const body = await result.arrayBuffer();
      if (unauthorized) return respond(401, "invalid_token", challenge(true));
      const combined = new Headers(result.headers);
      headers.forEach((value, key) => combined.set(key, value));
      options.log?.({
        event: "request",
        status: result.status,
        grantId: identity.grantId,
        clientId: identity.clientId,
      });
      return new Response(body.byteLength === 0 ? null : body, {
        status: result.status,
        headers: combined,
      });
    } catch {
      return unauthorized
        ? respond(401, "invalid_token", challenge(true))
        : respond(503, "temporarily_unavailable");
    } finally {
      await server.close();
      await transport.close();
    }
  };
}

async function preflight(
  client: HyperstarClient,
  identity: HostedIdentity,
): Promise<void> {
  const response = await client.get("/v1/whoami");
  WhoamiResponseSchema.extend({
    auth_surface: z.literal("mcp_connector"),
    actor_type: z.literal("user"),
    user_id: z.literal(identity.userId),
  }).parse(response);
}
