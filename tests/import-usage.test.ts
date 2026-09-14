import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { fixture, whoami } from "./hosted-support.js";
import {
  advertisedScopes,
  EXPANDED_SCOPES,
  RECOGNIZED_SCOPES,
} from "../src/hosted/config.js";

const id = "00000000-0000-4000-8000-000000000009";
const job = {
  job_id: id,
  campaign_id: 7,
  state: "awaiting_upload",
  phase: "none",
  total_count: 0,
  processed_count: 0,
  success_count: 0,
  skip_count: 0,
  error_count: 0,
  warning_count: 0,
  quota_state: "not_reserved",
  reserved_units: 0,
  refunded_units: 0,
  upload_expires_at: "2026-09-14T00:00:00Z",
  result_state: "not_requested",
  result_availability: "not_requested",
  result_attempt_count: 0,
  failure_code: null,
  failure_message: null,
  issues: [],
  omitted_issue_count: 0,
};

it("preserves direct POST fields, requires confirmation and surfaces result exhaustion", async () => {
  const seen: { path: string; body: unknown; key: string | null }[] = [];
  const test = await fixture(async (url, init) => {
    if (url.pathname === "/v1/whoami") return Response.json(whoami);
    seen.push({
      path: url.pathname,
      body: init.body ? JSON.parse(String(init.body)) : null,
      key: new Headers(init.headers).get("Idempotency-Key"),
    });
    if (url.pathname.endsWith("/intents"))
      return Response.json({
        job,
        upload: {
          url: "https://storage.example.test/",
          fields: { key: "opaque/source.csv", policy: "signed-policy" },
          expires_at: "2026-09-14T00:00:00Z",
        },
      });
    if (url.pathname.endsWith("/results"))
      return Response.json(
        { detail: { code: "results_unavailable", automatic_retry: false } },
        { status: 409 },
      );
    return Response.json({ ...job, state: "queued" });
  });
  const client = new Client({ name: "imports", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + (await test.token()) },
        },
      }),
    );
    const file = {
      mode: "direct",
      filename: "creators.csv",
      content_type: "text/csv",
      byte_size: 10,
      checksum_sha256: "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=",
    };
    const created = await client.callTool({
      name: "create_campaign_creator_import",
      arguments: { campaign_id: 7, idempotency_key: "fixture", upload: file },
    });
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({
      upload_method: "POST",
      upload: { fields: { key: "opaque/source.csv", policy: "signed-policy" } },
      reference: { type: "job", id },
    });
    expect(seen[0]).toMatchObject({
      key: "fixture",
      body: { filename: "creators.csv", checksum_sha256: file.checksum_sha256 },
    });
    const target = { campaign_id: 7, reference: { type: "job", id } };
    const calls = seen.length;
    expect(
      (
        await client.callTool({
          name: "confirm_campaign_creator_import",
          arguments: target,
        })
      ).isError,
    ).toBe(true);
    expect(seen).toHaveLength(calls);
    expect(
      (
        await client.callTool({
          name: "confirm_campaign_creator_import",
          arguments: { ...target, user_authorized: true },
        })
      ).isError,
    ).not.toBe(true);
    expect(seen.at(-1)?.body).toEqual({ user_authorized: true });
    expect(
      (
        await client.callTool({
          name: "get_campaign_creator_import_results",
          arguments: target,
        })
      ).structuredContent,
    ).toMatchObject({
      code: "results_unavailable",
      automatic_retry: false,
      reference: target.reference,
    });
  } finally {
    await client.close();
    await test.close();
  }
});

it.each([false, true])(
  "advertises usage only when enabled while recognizing all scopes (%s)",
  async (enabled) => {
    let lastBody: unknown;
    const test = await fixture(
      async (url, init) => {
        if (url.pathname === "/v1/whoami") return Response.json(whoami);
        lastBody = JSON.parse(String(init.body));
        return Response.json({
          as_of: "2026-09-13T00:00:00Z",
          status: "allowed_now",
          units: 0,
          unit_basis: "eligibility_estimated",
          usage: {
            feature: "email_unlock",
            availability: "available",
            limit: 0,
            period_end: null,
            reset_policy: "none",
            kind: "credit",
            stored_units: 0,
            available_units: 0,
          },
          shortfall: 0,
          reason: null,
          estimate: {
            campaign_id: 7,
            campaign_creator_ids: [9],
            authorization_maximum: 1,
            estimated_units: 0,
            active_grants: 0,
            free_restorations: 1,
            missing_catalog_email: 0,
          },
          advisory: true,
          reserves_units: false,
        });
      },
      { expandedScopesEnabled: true, usageScopeEnabled: enabled },
    );
    const client = new Client({ name: "usage", version: "1" });
    try {
      expect(advertisedScopes(test.config)).toEqual(
        enabled ? RECOGNIZED_SCOPES : EXPANDED_SCOPES,
      );
      await test.verify(
        await test.token({ scope: RECOGNIZED_SCOPES.join(" ") }),
      );
      await client.connect(
        new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
          requestInit: {
            headers: { Authorization: "Bearer " + (await test.token()) },
          },
        }),
      );
      const tools = (await client.listTools()).tools;
      expect(tools.some((tool) => tool.name === "get_workspace_usage")).toBe(
        enabled,
      );
      if (!enabled) return;
      expect(
        tools.find((tool) => tool.name === "check_operation_capacity")
          ?.annotations?.readOnlyHint,
      ).toBe(true);
      const request = {
        operation: "email_unlock",
        target: {
          type: "campaign_creators",
          campaign_id: 7,
          campaign_creator_ids: [9],
        },
      };
      const result = await client.callTool({
        name: "check_operation_capacity",
        arguments: { request },
      });
      expect(result.isError).not.toBe(true);
      expect(lastBody).toEqual(request);
      expect(result.structuredContent).toMatchObject({
        estimate: {
          authorization_maximum: 1,
          estimated_units: 0,
          free_restorations: 1,
        },
        reserves_units: false,
      });
      expect(JSON.stringify(result)).not.toContain("@example");
      expect(
        (
          await client.callTool({
            name: "check_operation_capacity",
            arguments: {
              request: {
                ...request,
                target: { ...request.target, campaign_creator_ids: [9, 9] },
              },
            },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
      await test.close();
    }
  },
);
