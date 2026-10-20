import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, expect, it } from "vitest";
import { createServer } from "node:http";

import { createHyperstarClient } from "../src/http.js";
import { HostedAuthorizationError } from "../src/hosted/auth.js";
import { createHostedTokenVerifier } from "../src/hosted/auth.js";
import { close, fixture, listen, whoami } from "./hosted-support.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});
const json = (value: unknown, status = 200) => Response.json(value, { status });
const envelope = (method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});
const rpc = (
  baseUrl: string,
  token: string | undefined,
  body: unknown,
  origin?: string,
) =>
  fetch(baseUrl + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });

it("challenges all unauthenticated operations and exposes exact resource discovery", async () => {
  let upstream = 0;
  const test = await fixture(async () => {
    upstream++;
    return json(whoami);
  });
  cleanups.push(test.close);
  for (const method of [
    "initialize",
    "tools/list",
    "resources/list",
    "prompts/list",
  ]) {
    const response = await rpc(test.baseUrl, undefined, envelope(method));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      'resource_metadata="https://mcp.dev.hyper-star.org/.well-known/oauth-protected-resource/mcp"',
    );
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "bulk_email:write",
    );
  }
  expect(upstream).toBe(0);
  const metadata = await fetch(
    test.baseUrl + "/.well-known/oauth-protected-resource/mcp",
  );
  expect((await metadata.json()).resource).toBe(test.config.resource);
  for (const method of ["GET", "DELETE"])
    expect((await fetch(test.baseUrl + "/mcp", { method })).status).toBe(405);
  expect(
    (
      await fetch(test.baseUrl + "/mcp", {
        method: "OPTIONS",
        headers: { Origin: "https://chatgpt.com" },
      })
    ).status,
  ).toBe(204);
  expect(
    (
      await rpc(
        test.baseUrl,
        await test.token(),
        envelope("tools/list"),
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
});

it("runs SDK tools and hosted guides without local auth/workspace tools", async () => {
  const seen: {
    url: string;
    auth: string | null;
    edge: string | null;
    redirect: string | undefined;
  }[] = [];
  const test = await fixture(async (url, init) => {
    const headers = new Headers(init.headers);
    seen.push({
      url: url.pathname,
      auth: headers.get("authorization"),
      edge: headers.get("x-hyperstar-edge-client"),
      redirect: init.redirect,
    });
    return url.pathname === "/v1/whoami"
      ? json(whoami)
      : json({ campaigns: [], total: 0, limit: 50, offset: 0 });
  });
  cleanups.push(test.close);
  const bearer = await test.token();
  const client = new Client({ name: "hosted-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + bearer } },
    }),
  );
  try {
    const list = await client.listTools();
    expect(list.tools).toHaveLength(24);
    // A single-workspace grant never names a workspace per call.
    expect(
      list.tools.some((tool) => "workspace_id" in tool.inputSchema.properties!),
    ).toBe(false);
    expect(
      list.tools.every((tool) => tool.annotations?.openWorldHint === true),
    ).toBe(true);
    const result = await client.callTool({
      name: "list_campaigns",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    const guide = await client.callTool({
      name: "get_hyperstar_workflow_guide",
      arguments: {},
    });
    expect(JSON.stringify(guide)).toContain("disconnect and reconnect");
    const resource = await client.readResource({
      uri: "hyperstar://guide/headless-workflow",
    });
    expect(
      seen.every(
        (item) =>
          item.auth === "Bearer " + bearer &&
          item.edge === test.config.edgeSecret &&
          item.redirect === "error",
      ),
    ).toBe(true);
    expect(
      seen.filter((item) => item.url === "/v1/whoami").length,
    ).toBeGreaterThanOrEqual(5);
  } finally {
    await client.close();
  }
});

it("makes an all-workspace grant name its workspace on every scoped call", async () => {
  const teammate = "00000000-0000-4000-8000-0000000000aa";
  const seen: { url: string; workspace: string | null }[] = [];
  const test = await fixture(async (url, init) => {
    seen.push({
      url: url.pathname,
      workspace: new Headers(init.headers).get("x-hyperstar-organization-id"),
    });
    if (url.pathname === "/v1/whoami")
      return json({ ...whoami, connector_workspace_access: "all" });
    if (url.pathname === "/v1/workspaces")
      return json({
        workspaces: [
          { organization_id: "workspace", name: "Mine", role: "owner" },
          { organization_id: teammate, name: "Teammate", role: "member" },
        ],
      });
    return json({ campaigns: [], total: 0, limit: 50, offset: 0 });
  });
  cleanups.push(test.close);
  const client = new Client({ name: "hosted-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
      requestInit: {
        headers: { Authorization: "Bearer " + (await test.token()) },
      },
    }),
  );
  try {
    const tools = new Map(
      (await client.listTools()).tools.map((tool) => [tool.name, tool]),
    );
    expect(tools.get("list_campaigns")?.inputSchema.required).toContain(
      "workspace_id",
    );
    expect(
      tools.get("list_workspaces")?.inputSchema.properties,
    ).not.toHaveProperty("workspace_id");
    expect(
      tools.get("hyperstar_whoami")?.inputSchema.required ?? [],
    ).not.toContain("workspace_id");

    const listed = await client.callTool({
      name: "list_workspaces",
      arguments: {},
    });
    expect(JSON.stringify(listed)).toContain("Teammate");

    const missing = await client.callTool({
      name: "list_campaigns",
      arguments: {},
    });
    expect(missing.isError).toBe(true);
    expect(seen.some((item) => item.url === "/v1/campaigns")).toBe(false);

    const scoped = await client.callTool({
      name: "list_campaigns",
      arguments: { workspace_id: teammate },
    });
    expect(scoped.isError).not.toBe(true);
    expect(seen.filter((item) => item.url === "/v1/campaigns")).toEqual([
      { url: "/v1/campaigns", workspace: teammate },
    ]);
    // Grant checks and discovery stay on the default workspace.
    expect(
      seen
        .filter((item) => item.url !== "/v1/campaigns")
        .every((item) => item.workspace === null),
    ).toBe(true);
  } finally {
    await client.close();
  }
});

it("rechecks revocation on initialize, static tools, resources and prompts", async () => {
  let status = 200;
  const test = await fixture(async () =>
    json(status === 200 ? whoami : { detail: "revoked" }, status),
  );
  cleanups.push(test.close);
  const bearer = await test.token();
  expect((await rpc(test.baseUrl, bearer, envelope("tools/list"))).status).toBe(
    200,
  );
  status = 401;
  for (const method of [
    "initialize",
    "tools/list",
    "resources/list",
    "prompts/list",
  ]) {
    const response = await rpc(test.baseUrl, bearer, envelope(method));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"',
    );
  }
  status = 403;
  expect((await rpc(test.baseUrl, bearer, envelope("tools/list"))).status).toBe(
    403,
  );
  status = 503;
  const unavailable = await rpc(test.baseUrl, bearer, envelope("tools/list"));
  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("WWW-Authenticate")).toBeNull();
});

it("rejects wrong JWT bindings and retains both published keys across rotation", async () => {
  const test = await fixture(async () => json(whoami));
  cleanups.push(test.close);
  for (const change of [
    { type: "access" },
    { type: "cli_access" },
    { aud: "wrong" },
    { aud: [test.config.resource] },
    { iss: "wrong" },
    { exp: 1 },
    { scope: "unknown" },
  ]) {
    expect(
      (
        await rpc(
          test.baseUrl,
          await test.token(change),
          envelope("tools/list"),
        )
      ).status,
    ).toBe(401);
  }
  test.publishNext();
  const freshVerifier = createHostedTokenVerifier(test.config);
  expect(await freshVerifier(await test.token({}, "next"))).toHaveProperty(
    "grantId",
  );
  expect(await freshVerifier(await test.token())).toHaveProperty("grantId");
  expect(
    (
      await rpc(
        test.baseUrl,
        (await test.token()).slice(0, -8) + "tampered",
        envelope("tools/list"),
      )
    ).status,
  ).toBe(401);
  expect(test.jwksRequests()).toBeLessThanOrEqual(2);
});

it("fails closed on unavailable JWKS without calling Product API", async () => {
  let upstream = 0;
  const test = await fixture(async () => {
    upstream++;
    return json(whoami);
  });
  cleanups.push(test.close);
  test.failJwks();
  await expect(test.verify(await test.token())).rejects.toEqual(
    new HostedAuthorizationError(503),
  );
  expect(upstream).toBe(0);
});

it("does not forward a bearer through an upstream redirect", async () => {
  let leakedRequests = 0;
  const receiver = createServer((_request, response) => {
    leakedRequests++;
    response.end("{}");
  });
  const destination = await listen(receiver);
  cleanups.push(() => close(receiver));
  const redirector = createServer((_request, response) => {
    response.writeHead(302, { Location: destination + "/stolen" });
    response.end();
  });
  const source = await listen(redirector);
  cleanups.push(() => close(redirector));
  const client = createHyperstarClient({
    config: {
      authMode: "hosted",
      apiBaseUrl: source,
      bearerToken: "secret-bearer",
      edgeSecret: "secret-edge",
      signal: new AbortController().signal,
      onUnauthorized: () => undefined,
    },
  });
  await expect(client.get("/v1/whoami")).rejects.toThrow();
  expect(leakedRequests).toBe(0);
});

it("isolates concurrent caller credentials and ignores extra auth/workspace headers", async () => {
  const seen: Headers[] = [];
  const config = {
    authMode: "hosted" as const,
    apiBaseUrl: "https://autopilot.example",
    edgeSecret: "edge",
    signal: new AbortController().signal,
    onUnauthorized: () => undefined,
  };
  const fetcher = async (_url: URL, init: RequestInit) => {
    await Promise.resolve();
    seen.push(new Headers(init.headers));
    return json({});
  };
  const first = createHyperstarClient({
    config: { ...config, bearerToken: "first" },
    fetcher,
  });
  const second = createHyperstarClient({
    config: { ...config, bearerToken: "second" },
    fetcher,
  });
  await Promise.all([
    first.post(
      "/v1/campaigns",
      {},
      {
        "x-hyperstar-api-key": "injected",
        "x-hyperstar-organization-id": "other",
      },
    ),
    second.get("/v1/whoami"),
  ]);
  expect(seen.map((headers) => headers.get("authorization")).sort()).toEqual([
    "Bearer first",
    "Bearer second",
  ]);
  expect(
    seen.every(
      (headers) =>
        !headers.has("x-hyperstar-api-key") &&
        !headers.has("x-hyperstar-organization-id"),
    ),
  ).toBe(true);
});
