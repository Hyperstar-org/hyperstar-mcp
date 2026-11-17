import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, it } from "vitest";
import { fixture, whoami } from "./hosted-support.js";

it("forwards YouTube lookup and retry-safe video registration", async () => {
  const calls: { path: string; search: URLSearchParams; body: unknown }[] = [];
  const test = await fixture(
    async (url, init) => {
      if (url.pathname === "/v1/whoami") return Response.json(whoami);
      calls.push({
        path: url.pathname,
        search: url.searchParams,
        body: init.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.pathname === "/v1/creators/lookup")
        return Response.json({
          found: true,
          creator: {
            id: 12,
            origin_id: "UCStableIdentity",
            username: null,
            display_name: "Channel",
            biography: null,
            follower_count: 12000,
            country: "US",
            profile_image: null,
            email: null,
            is_email_locked: true,
            profile_average_views: 100,
            profile_average_engagement_rate_percent: 4,
            recent_content: [],
          },
        });
      return Response.json({
        video_id: 7,
        campaign_id: 3,
        campaign_creator_id: 8,
        platform: "youtube",
        origin_id: "abcdefghijk",
        video_url: "https://youtu.be/abcdefghijk",
        collaboration_status: "pending_review",
        tracking_status: "paused",
        campaign_creator_outreach_stage: "posted",
        outreach_stage_advanced: true,
      });
    },
    { expandedScopesEnabled: true },
  );
  const input = {
    campaign_id: 3,
    campaign_creator_id: 8,
    video_url: "https://youtu.be/abcdefghijk",
    start_tracking: false,
    idempotency_key: "video-1",
  };
  const client = new Client({ name: "creator-workflow-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(test.baseUrl + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + (await test.token()) },
        },
      }),
    );
    const creator = await client.callTool({
      name: "get_creator",
      arguments: {
        platform: "youtube",
        selector: { type: "origin_id", origin_id: "UCStableIdentity" },
      },
    });
    expect(creator.isError, JSON.stringify(creator)).not.toBe(true);
    expect(creator.structuredContent).toMatchObject({
      found: true,
      creator: {
        origin_id: "UCStableIdentity",
        email: null,
        is_email_locked: true,
      },
    });
    expect(calls[0]?.search.get("platform")).toBe("youtube");
    expect(calls[0]?.search.get("origin_id")).toBe("UCStableIdentity");
    const video = await client.callTool({
      name: "register_campaign_video",
      arguments: input,
    });
    expect(video.isError).not.toBe(true);
    expect(video.structuredContent).toMatchObject({
      video_id: 7,
      tracking_status: "paused",
    });
    expect(calls[1]).toMatchObject({
      path: "/v1/campaigns/3/creators/8/videos",
      body: {
        video_url: input.video_url,
        start_tracking: false,
        idempotency_key: "video-1",
      },
    });
    expect(calls).toHaveLength(2);
  } finally {
    await client.close();
    await test.close();
  }
});
