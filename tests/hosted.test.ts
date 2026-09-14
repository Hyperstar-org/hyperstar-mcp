import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";

import { createHyperstarClient } from "../src/http.js";
import { HostedAuthorizationError } from "../src/hosted/auth.js";
import { createHostedTokenVerifier } from "../src/hosted/auth.js";
import { readHostedConfig } from "../src/hosted/config.js";
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
    expect(list.tools).toHaveLength(23);
    expect(list.tools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(["start_browser_login", "list_workspaces"]),
    );
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
    expect(JSON.stringify(guide)).not.toContain("start_browser_login");
    const resource = await client.readResource({
      uri: "hyperstar://guide/headless-workflow",
    });
    expect(JSON.stringify(resource)).not.toContain("list_workspaces");
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

it("replaces buffered tool errors only for late upstream 401", async () => {
  let failure = 401;
  const test = await fixture(async (url) =>
    url.pathname === "/v1/whoami"
      ? json(whoami)
      : json({ detail: "permission denied" }, failure),
  );
  cleanups.push(test.close);
  const bearer = await test.token();
  const call = envelope("tools/call", {
    name: "list_campaigns",
    arguments: {},
  });
  const expired = await rpc(test.baseUrl, bearer, call);
  expect(expired.status).toBe(401);
  failure = 403;
  const denied = await rpc(test.baseUrl, bearer, call);
  expect(denied.status).toBe(200);
  expect((await denied.json()).result.isError).toBe(true);
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

it("refetches unknown keys after the bounded cooldown and throttles repeated misses", async () => {
  const test = await fixture(async () => json(whoami));
  cleanups.push(test.close);
  await test.verify(await test.token());
  test.publishNext();
  const nextToken = await test.token({}, "next");
  await expect(test.verify(nextToken)).rejects.toEqual(
    new HostedAuthorizationError(401),
  );
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
  try {
    expect(await test.verify(nextToken)).toHaveProperty("grantId");
    for (let index = 0; index < 3; index++)
      await expect(
        test.verify(await test.token({}, "unknown")),
      ).rejects.toEqual(new HostedAuthorizationError(401));
    expect(test.jwksRequests()).toBe(2);
  } finally {
    clock.mockRestore();
  }
});

it("aborts the upstream tool request when the HTTP caller disconnects", async () => {
  let start: () => void = () => undefined;
  let stop: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const test = await fixture(async (url, init) => {
    if (url.pathname === "/v1/whoami") return json(whoami);
    start();
    return new Promise<Response>((_resolve, reject) =>
      init.signal?.addEventListener(
        "abort",
        () => {
          stop();
          reject(new Error("aborted"));
        },
        { once: true },
      ),
    );
  });
  cleanups.push(test.close);
  const controller = new AbortController();
  const call = fetch(test.baseUrl + "/mcp", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer " + (await test.token()),
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify(
      envelope("tools/call", { name: "list_campaigns", arguments: {} }),
    ),
  });
  await started;
  controller.abort();
  await expect(call).rejects.toThrow();
  await stopped;
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

it("requires hosted configuration without consulting local credentials", () => {
  expect(() => readHostedConfig({ HYPERSTAR_API_KEY: "local-secret" })).toThrow(
    "Invalid hosted MCP configuration",
  );
  const env = {
    MCP_ISSUER: "https://api.example",
    MCP_API_BASE_URL: "https://api.example",
    MCP_RESOURCE_URL: "https://mcp.example/mcp",
    MCP_JWKS_URL: "https://api.example/oauth/jwks.json",
    MCP_EDGE_SECRET: "e".repeat(32),
    HYPERSTAR_API_KEY: "ignored",
  };
  expect(readHostedConfig(env).apiBaseUrl).toBe("https://api.example");
  expect(() =>
    readHostedConfig({ ...env, MCP_API_BASE_URL: "https://other.example" }),
  ).toThrow();
});
