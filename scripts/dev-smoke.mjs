#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requireSmokeConfig() {
  const apiBaseUrl = requiredEnv("HYPERSTAR_API_BASE_URL");
  const appBaseUrl = requiredEnv("HYPERSTAR_APP_BASE_URL");
  const campaignId = positiveIntegerEnv("HYPERSTAR_MCP_SMOKE_CAMPAIGN_ID");
  const campaignName = requiredEnv("HYPERSTAR_MCP_SMOKE_CAMPAIGN_NAME");
  const recipientId = positiveIntegerEnv("HYPERSTAR_MCP_SMOKE_RECIPIENT_ID");
  if (process.env.HYPERSTAR_MCP_SMOKE_INTERNAL_FIXTURE !== "1") {
    throw new Error(
      "Set HYPERSTAR_MCP_SMOKE_INTERNAL_FIXTURE=1 only when using an approved internal smoke-test fixture.",
    );
  }
  return { apiBaseUrl, appBaseUrl, campaignId, campaignName, recipientId };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for Hyperstar MCP smoke testing`);
  }
  return value;
}

function payload(result) {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const first = result.content?.[0];
  if (first?.type !== "text") {
    throw new Error("MCP tool returned no JSON text content");
  }
  return JSON.parse(first.text);
}

async function call(client, name, args = {}) {
  return payload(await client.callTool({ name, arguments: args }));
}

function logStep(step, details) {
  console.log(JSON.stringify({ step, ...details }, null, 2));
}

function campaignId(row) {
  return row.id ?? row.campaign_id;
}

function campaignName(row) {
  return row.name ?? row.title;
}

function rosterRows(page) {
  return page.creators ?? page.influencers ?? [];
}

function positiveIntegerEnv(name) {
  const raw = requiredEnv(name);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function main() {
  const smokeConfig = requireSmokeConfig();

  const client = new Client({
    name: "hyperstar-mcp-dev-smoke",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(rootDir, "dist/index.js")],
    env: {
      ...process.env,
      HYPERSTAR_API_BASE_URL: smokeConfig.apiBaseUrl,
      HYPERSTAR_APP_BASE_URL: smokeConfig.appBaseUrl,
    },
  });

  await client.connect(transport);
  try {
    const tools = await client.listTools();
    logStep("listTools", { toolCount: tools.tools.length });

    const whoami = await call(client, "hyperstar_whoami");
    logStep("hyperstar_whoami", {
      actor_type: whoami.actor_type,
      organization_id: whoami.organization_id,
      scopes: whoami.scopes,
    });

    const campaigns = await call(client, "list_campaigns", {
      limit: 100,
      offset: 0,
    });
    const smokeCampaign = (campaigns.campaigns ?? []).find(
      (campaign) =>
        campaignId(campaign) === smokeConfig.campaignId &&
        campaignName(campaign) === smokeConfig.campaignName,
    );
    if (smokeCampaign === undefined) {
      throw new Error("Expected smoke-test campaign was not found");
    }
    logStep("list_campaigns", {
      smoke_campaign_id: smokeConfig.campaignId,
      totalReturned: campaigns.campaigns?.length ?? 0,
    });

    const roster = await call(client, "list_campaign_creators", {
      campaign_id: smokeConfig.campaignId,
      limit: 200,
      offset: 0,
    });
    const rows = rosterRows(roster);
    logStep("list_campaign_creators", {
      campaign_id: smokeConfig.campaignId,
      returned: rows.length,
      total: roster.total,
      firstIds: rows
        .slice(0, 5)
        .map((row) => row.id ?? row.campaign_creator_id),
    });

    const readiness = await call(client, "check_bulk_email_readiness", {
      campaign_id: smokeConfig.campaignId,
      recipient_target: {
        type: "ids",
        campaign_creator_ids: [smokeConfig.recipientId],
      },
    });
    logStep("check_bulk_email_readiness", {
      campaign_id: smokeConfig.campaignId,
      campaign_creator_ids: [smokeConfig.recipientId],
      sendable: readiness.sendable,
      total: readiness.total,
    });

    if (process.env.HYPERSTAR_MCP_SMOKE_REAL_SEND === "1") {
      if (readiness.sendable !== 1) {
        throw new Error("Selected smoke-test recipient is not sendable");
      }
      const stamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14);
      const started = await call(client, "start_bulk_email", {
        campaign_id: smokeConfig.campaignId,
        recipient_target: {
          type: "ids",
          campaign_creator_ids: [smokeConfig.recipientId],
        },
        subject: `Hyperstar MCP dev smoke ${stamp}`,
        body_text:
          "Hyperstar MCP smoke test for an approved internal-recipient campaign. No action required.",
        idempotency_key: `mcp-smoke-${smokeConfig.campaignId}-${smokeConfig.recipientId}-${stamp}`,
        send_confirmation: "user_authorized",
      });
      logStep("start_bulk_email", {
        job_id: started.job_id ?? started.id,
        status: started.status,
        next_tool: started.next_tool,
      });
    } else {
      logStep("start_bulk_email", {
        skipped: true,
        reason:
          "Set HYPERSTAR_MCP_SMOKE_REAL_SEND=1 to exercise the real-send path.",
      });
    }

    const inbox = await call(client, "list_inbox_threads", {
      limit: 3,
      offset: 0,
    });
    const threads = inbox.threads ?? inbox.items ?? [];
    logStep("list_inbox_threads", {
      returned: threads.length,
      firstThreadIds: threads
        .slice(0, 3)
        .map((thread) => thread.thread_id ?? thread.id),
    });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
