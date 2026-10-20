import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { fixture, whoami } from "./hosted-support.js";

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
