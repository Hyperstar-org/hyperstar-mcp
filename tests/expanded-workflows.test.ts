import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { fixture, whoami } from "./hosted-support.js";
import { HYPERSTAR_TOOL_ORDER } from "../src/tool-metadata.js";
import { isHostedTool } from "../src/surface.js";
import { RECOGNIZED_SCOPES } from "../src/hosted/config.js";

it("discovers expanded tools only after activation and preserves new send inputs over HTTP", async () => {
  const seen: { method: string | undefined; path: string; body: unknown }[] =
    [];
  const test = await fixture(
    async (url, init) => {
      if (url.pathname === "/v1/whoami") return Response.json(whoami);
      const body = init.body ? JSON.parse(String(init.body)) : null;
      seen.push({ method: init.method, path: url.pathname, body });
      if (url.pathname.endsWith("/readiness"))
        return Response.json({
          total: 1,
          verified: 1,
          unlocked: 1,
          locked: 0,
          missing: 0,
          sendable: 1,
        });
      if (url.pathname.endsWith("/report"))
        return Response.json(
          { detail: "Missing required scope: performance:read" },
          { status: 403 },
        );
      if (url.pathname === "/v1/forms/library")
        return Response.json({ forms: [], total: 0, next_offset: null });
      return Response.json(
        { detail: "Unexpected fixture route" },
        { status: 500 },
      );
    },
    { expandedScopesEnabled: true },
  );
  const client = new Client({ name: "expanded-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + (await test.token()) },
        },
      }),
    );
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toEqual(
      HYPERSTAR_TOOL_ORDER.filter(isHostedTool).filter(
        (name) =>
          !["get_workspace_usage", "check_operation_capacity"].includes(name),
      ),
    );
    expect(
      tools.find((tool) => tool.name === "get_campaign_revenue")?._meta
        ?.securitySchemes,
    ).toEqual([{ type: "oauth2", scopes: ["performance:read"] }]);
    const sender = "00000000-0000-4000-8000-000000000003";
    const readiness = await client.callTool({
      name: "check_bulk_email_readiness",
      arguments: {
        campaign_id: 9,
        kind: "follow_up",
        threading: "require_existing",
        email_account_id: sender,
        recipient_target: { type: "ids", campaign_creator_ids: [7] },
      },
    });
    expect(readiness.isError).not.toBe(true);
    expect(seen.at(-1)).toEqual({
      method: "POST",
      path: "/v1/campaigns/9/bulk-email/readiness",
      body: {
        kind: "follow_up",
        threading: "require_existing",
        email_account_id: sender,
        campaign_creator_ids: [7],
      },
    });
    expect(readiness.structuredContent).toMatchObject({
      next_arguments: {
        kind: "follow_up",
        threading: "require_existing",
        email_account_id: sender,
      },
    });
    const denied = await client.callTool({
      name: "get_campaign_performance",
      arguments: {
        campaign_id: 9,
        start: "2026-09-01T00:00:00Z",
        end: "2026-09-02T00:00:00Z",
      },
    });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain("Reconnect with fresh consent");
    const count = seen.length;
    for (const name of [
      "retry_campaign_email_wave",
      "cancel_campaign_email_wave",
    ]) {
      expect(
        (
          await client.callTool({
            name,
            arguments: { wave_id: sender, idempotency_key: "retry" },
          })
        ).isError,
      ).toBe(true);
    }
    expect(seen).toHaveLength(count);
    expect(
      (await client.callTool({ name: "list_forms", arguments: {} })).isError,
    ).not.toBe(true);
    expect(
      await test.verify(
        await test.token({ scope: RECOGNIZED_SCOPES.join(" ") }),
      ),
    ).toHaveProperty("grantId");
  } finally {
    await client.close();
    await test.close();
  }
});

it("serializes actor-bound upload inputs without file bytes or discarded target fields", async () => {
  let body: unknown;
  const id = "00000000-0000-4000-8000-000000000009";
  const test = await fixture(
    async (url, init) => {
      if (url.pathname === "/v1/whoami") return Response.json(whoami);
      body = JSON.parse(String(init.body));
      return Response.json({
        transfer_id: id,
        state: "pending",
        expires_at: "2026-09-03T00:00:00Z",
        handoff_url: "https://app.dev.hyper-star.org/mcp/uploads/" + id,
        file: {
          file_name: "contract.pdf",
          content_type: "application/pdf",
          size_bytes: 200,
        },
        upload: {
          upload_url: "https://storage.example/signed",
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          expires_at: "2026-09-02T00:15:00Z",
        },
        result: null,
      });
    },
    { expandedScopesEnabled: true },
  );
  const client = new Client({ name: "file-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + (await test.token()) },
        },
      }),
    );
    const input = {
      target: {
        kind: "contract",
        campaign_id: 1,
        campaign_creator_id: 2,
        replacement_confirmation: "user_authorized",
      },
      file: {
        file_name: "contract.pdf",
        content_type: "application/pdf",
        size_bytes: 200,
      },
      idempotency_key: "file",
    };
    const result = await client.callTool({
      name: "create_file_upload",
      arguments: input,
    });
    expect(result.isError).not.toBe(true);
    expect(body).toEqual(input);
    expect(result.structuredContent).toMatchObject({
      transfer_id: id,
      upload: { method: "PUT" },
    });
    expect(
      (
        await client.callTool({
          name: "create_file_upload",
          arguments: { ...input, file: { ...input.file, base64: "data" } },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    await test.close();
  }
});

it("accepts the canonical add-creator response without update-only contact fields", async () => {
  const creator = {
    id: 12,
    campaign_id: 9,
    platform: "tiktok",
    creator_id: null,
    origin_id: null,
    username: "internal_fixture",
    nickname: null,
    outreach_stage: "added",
    email: "fixture@example.com",
    notes: null,
    country: null,
    source_type: "manual_add",
    negotiated_price: null,
    negotiated_currency: null,
    payment_method: null,
    secondary_usage_status: null,
  };
  const test = await fixture(
    async (url) =>
      Response.json(url.pathname === "/v1/whoami" ? whoami : creator),
    { expandedScopesEnabled: true },
  );
  const client = new Client({ name: "creator-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + (await test.token()) },
        },
      }),
    );
    const result = await client.callTool({
      name: "add_campaign_creator",
      arguments: {
        campaign_id: 9,
        platform: "tiktok",
        username: "internal_fixture",
        email: "fixture@example.com",
        idempotency_key: "add-fixture",
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(creator);
  } finally {
    await client.close();
    await test.close();
  }
});
