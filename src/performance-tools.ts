import { z } from "zod";
import { CampaignTargetSchema } from "./campaign-inputs.js";
import type { HyperstarClient } from "./http.js";
import { queryFrom } from "./tool-http-helpers.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Window = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    granularity: z.enum(["day", "week", "month"]).default("day"),
  })
  .strict();
const Input = CampaignTargetSchema.extend(Window.shape).refine((input) => {
  const span = Date.parse(input.end) - Date.parse(input.start);
  return span > 0 && span <= 180 * 86400000;
}, "Choose an increasing window of at most 180 days");
const PageInput = CampaignTargetSchema.extend(Window.shape).extend({
  sort_by: z
    .enum(["views", "likes", "comments", "shares", "collects"])
    .default("views"),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});
const Metrics = z.object({
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  collects: z.number().nullable(),
});
const Video = z.object({
  video_id: z.number().int(),
  campaign_creator_id: z.number().int(),
  platform: z.string(),
  username: z.string().nullable(),
  lifetime: Metrics,
  period: Metrics,
  baseline_at: z.string().nullable(),
  observed_through: z.string().nullable(),
  availability: z.enum(["available", "missing_baseline", "missing_history"]),
});
const Creator = z.object({
  campaign_creator_id: z.number().int(),
  username: z.string().nullable(),
  video_count: z.number().int(),
  videos_with_baseline: z.number().int(),
  lifetime: Metrics,
  period: Metrics,
});
const Summary = z.object({
  campaign_id: z.number().int(),
  window: Window,
  timezone: z.literal("UTC"),
  interval: z.literal("(start,end]"),
  metric_unit: z.literal("count"),
  video_count: z.number().int(),
  videos_with_baseline: z.number().int(),
  lifetime: Metrics,
  period: Metrics,
  observed_through: z.string().nullable(),
  generated_at: z.string(),
});
const VideoPage = z.object({
  window: Window,
  videos: z.array(Video),
  total: z.number().int(),
  next_offset: z.number().int().nullable(),
});
const CreatorPage = z.object({
  window: Window,
  creators: z.array(Creator),
  total: z.number().int(),
  next_offset: z.number().int().nullable(),
});
const History = z.object({
  window: Window,
  video: Video,
  buckets: z.array(
    z.object({
      bucket_start: z.string(),
      observed_at: z.string(),
      cumulative: Metrics,
    }),
  ),
});

const RevenueInput = CampaignTargetSchema.extend({
  start_date: z.string().date(),
  end_date: z.string().date(),
  include_points: z.boolean().default(false),
  include_products: z.boolean().default(false),
  product_offset: z.number().int().min(0).default(0),
  product_limit: z.number().int().min(1).max(100).default(25),
});
const Revenue = z.object({
  campaign_id: z.number().int(),
  start_date: z.string().date(),
  end_date: z.string().date(),
  date_basis: z.literal("inclusive_provider_metric_dates"),
  availability: z.enum(["available", "no_connected_enabled_provider"]),
  providers: z.array(
    z.object({
      provider: z.string(),
      metric: z.string(),
      currency: z.string().nullable(),
      total_revenue: z.string().nullable(),
      last_metric_date: z.string().nullable(),
      points: z.array(
        z.object({
          date: z.string().date(),
          revenue: z.string(),
          orders: z.number().nullable(),
          units: z.number().nullable(),
        }),
      ),
      products: z.array(
        z.object({
          account_id: z.string(),
          product_id: z.string(),
          title: z.string().nullable(),
          total_revenue: z.string().nullable(),
        }),
      ),
      total_products: z.number().int(),
      next_product_offset: z.number().int().nullable(),
    }),
  ),
});

export function registerPerformanceTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "get_campaign_revenue",
    { ...toolMetadata("get_campaign_revenue"), inputSchema: RevenueInput },
    async ({ campaign_id, ...query }) =>
      toolResult({
        ...Revenue.parse(
          await client.get(
            `/v1/performance/campaigns/${campaign_id}/report/revenue`,
            queryFrom(query),
          ),
        ),
        agent_guidance:
          "Finalized revenue uses inclusive provider metric dates and native currencies. Do not combine different currencies. Null means no reported data; provisional estimates are excluded.",
      }),
  );
  server.registerTool(
    "get_campaign_performance",
    { ...toolMetadata("get_campaign_performance"), inputSchema: Input },
    async ({ campaign_id, ...window }) =>
      toolResult({
        ...Summary.parse(
          await client.get(
            `/v1/performance/campaigns/${campaign_id}/report`,
            queryFrom(window),
          ),
        ),
        agent_guidance:
          "Period metrics are observed changes in (start,end], distinct from lifetime counters. Null means missing baseline/history or hidden metrics. Tracked-video performance supports TikTok and Instagram.",
      }),
  );
  server.registerTool(
    "list_campaign_video_performance",
    {
      ...toolMetadata("list_campaign_video_performance"),
      inputSchema: PageInput,
    },
    async ({ campaign_id, ...query }) =>
      toolResult(
        VideoPage.parse(
          await client.get(
            `/v1/performance/campaigns/${campaign_id}/report/videos`,
            queryFrom(query),
          ),
        ),
      ),
  );
  server.registerTool(
    "list_campaign_creator_performance",
    {
      ...toolMetadata("list_campaign_creator_performance"),
      inputSchema: PageInput,
    },
    async ({ campaign_id, ...query }) =>
      toolResult(
        CreatorPage.parse(
          await client.get(
            `/v1/performance/campaigns/${campaign_id}/report/creators`,
            queryFrom(query),
          ),
        ),
      ),
  );
  server.registerTool(
    "get_campaign_video_history",
    {
      ...toolMetadata("get_campaign_video_history"),
      inputSchema: CampaignTargetSchema.extend(Window.shape).extend({
        video_id: z.number().int().positive(),
      }),
    },
    async ({ campaign_id, video_id, ...window }) =>
      toolResult(
        History.parse(
          await client.get(
            `/v1/performance/campaigns/${campaign_id}/report/videos/${video_id}/history`,
            queryFrom(window),
          ),
        ),
      ),
  );
}
