import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { fixture, whoami } from "./hosted-support.js";

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
