import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createHostedTokenVerifier } from "../src/hosted/auth.js";
import { HOSTED_SCOPES, type HostedConfig } from "../src/hosted/config.js";
import { createHostedHandler } from "../src/hosted/handler.js";
import { createNodeHostedServer } from "../src/hosted/http-server.js";

export const USER_ID = "00000000-0000-4000-8000-000000000001";
export const GRANT_ID = "00000000-0000-4000-8000-000000000002";
export const CLIENT_ID = "https://claude.ai/oauth/test";
export const whoami = {
  auth_surface: "mcp_connector",
  actor_type: "user",
  user_id: USER_ID,
  service_account_id: null,
  organization_id: "workspace",
  scopes: [...HOSTED_SCOPES],
  capabilities: {
    search: true,
    campaigns_read: true,
    campaigns_write: true,
    bulk_email: true,
    inbox_read: true,
    inbox_write: true,
  },
};

export async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Missing test listener");
  return `http://127.0.0.1:${address.port}`;
}

export async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections();
  await closed;
}

export async function fixture(
  fetcher: (url: URL, init: RequestInit) => Promise<Response>,
  overrides: Partial<HostedConfig> = {},
) {
  const key = await generateKeyPair("RS256");
  const next = await generateKeyPair("RS256");
  const firstJwk = {
    ...(await exportJWK(key.publicKey)),
    kid: "first",
    alg: "RS256",
    use: "sig",
  };
  const nextJwk = {
    ...(await exportJWK(next.publicKey)),
    kid: "next",
    alg: "RS256",
    use: "sig",
  };
  let keys = [firstJwk];
  let jwksRequests = 0;
  let jwksStatus = 200;
  const jwks = createServer((request, response) => {
    jwksRequests++;
    response.writeHead(jwksStatus, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ keys }));
  });
  const jwksBase = await listen(jwks);
  const config: HostedConfig = {
    issuer: "https://autopilot.dev.hyper-star.org",
    resource: "https://mcp.dev.hyper-star.org/mcp",
    apiBaseUrl: "https://autopilot.dev.hyper-star.org",
    jwksUrl: jwksBase + "/oauth/jwks.json",
    edgeSecret: "test-edge-secret-not-real-123456789",
    allowedOrigins: new Set(["https://claude.ai", "https://chatgpt.com"]),
    port: 0,
    ...overrides,
  };
  const verify = createHostedTokenVerifier(config);
  const handle = createHostedHandler({ config, verify, fetcher });
  const { server } = createNodeHostedServer(config, handle);
  const baseUrl = await listen(server);
  async function token(update: Record<string, unknown> = {}, kid = "first") {
    return new SignJWT({
      type: "mcp_access",
      sub: USER_ID,
      jti: GRANT_ID,
      client_id: CLIENT_ID,
      scope: HOSTED_SCOPES.join(" "),
      iss: config.issuer,
      aud: config.resource,
      exp: Math.floor(Date.now() / 1000) + 900,
      ...update,
    })
      .setProtectedHeader({ alg: "RS256", kid })
      .sign(kid === "next" ? next.privateKey : key.privateKey);
  }
  return {
    baseUrl,
    config,
    verify,
    token,
    handle,
    jwksRequests: () => jwksRequests,
    publishNext: () => {
      keys = [firstJwk, nextJwk];
    },
    failJwks: () => {
      jwksStatus = 503;
    },
    close: async () => {
      await close(server);
      await close(jwks);
    },
  };
}
