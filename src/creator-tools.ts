import { z } from "zod";
import type { HyperstarClient } from "./http.js";
import { queryFrom } from "./tool-http-helpers.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";
import type { ToolRegistrar } from "./tool-registrar.js";

const Creator = z.object({
  id: z.number().int(),
  origin_id: z.string(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  biography: z.string().nullable(),
  follower_count: z.number().nullable(),
  country: z.string().nullable(),
  profile_image: z.string().nullable(),
  email: z.string().nullable(),
  is_email_locked: z.boolean(),
  profile_average_views: z.number().nullable(),
  profile_average_engagement_rate_percent: z.number().nullable(),
  recent_content: z.array(
    z.object({
      content_id: z.string(),
      caption: z.string().nullable(),
      cover_image: z.string().nullable(),
      like_count: z.number(),
      comment_count: z.number(),
      share_count: z.number(),
      play_count: z.number(),
      collect_count: z.number(),
    }),
  ),
});

const CatalogPlatform = z
  .enum(["tiktok", "instagram"])
  .describe("Creator indexing supports TikTok and Instagram.");
const CatalogUsername = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe("Platform handle, with or without a leading @.");
const CatalogStatusResponse = z.object({
  platform: CatalogPlatform,
  username: z.string(),
  status: z.enum([
    "ready_in_catalog",
    "processing",
    "not_in_catalog",
    "not_found_on_platform",
  ]),
});
const CatalogEnrichmentResponse = z.object({
  platform: CatalogPlatform,
  username: z.string(),
  status: z.enum(["added", "already_processing", "already_in_catalog"]),
});

const CATALOG_STATUS_GUIDANCE: Record<
  z.infer<typeof CatalogStatusResponse>["status"],
  string
> = {
  ready_in_catalog:
    "The creator is indexed. A reference search with this creator can be created now.",
  processing:
    "The creator is being indexed. Poll get_creator_catalog_status every 15-30 seconds; indexing usually takes a few minutes. Do not create the reference search until the status is ready_in_catalog.",
  not_in_catalog:
    "The creator is not indexed. Call request_creator_catalog_enrichment, then poll get_creator_catalog_status until ready_in_catalog before creating the reference search.",
  not_found_on_platform:
    "The platform does not know this username. Check the handle with the user instead of retrying.",
};

export function registerCreatorTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
  server.registerTool(
    "get_creator_catalog_status",
    {
      ...toolMetadata("get_creator_catalog_status"),
      inputSchema: z
        .object({ platform: CatalogPlatform, username: CatalogUsername })
        .strict(),
    },
    async ({ platform, username }) => {
      const status = CatalogStatusResponse.parse(
        await client.get(
          "/v1/creators/catalog-status",
          queryFrom({ platform, username }),
        ),
      );
      return toolResult({
        ...status,
        agent_guidance: CATALOG_STATUS_GUIDANCE[status.status],
        ...(status.status === "not_in_catalog"
          ? {
              next_tool: "request_creator_catalog_enrichment",
              next_arguments: { platform, username: status.username },
            }
          : status.status === "ready_in_catalog"
            ? { next_tool: "search_creators" }
            : {}),
      });
    },
  );

  server.registerTool(
    "request_creator_catalog_enrichment",
    {
      ...toolMetadata("request_creator_catalog_enrichment"),
      inputSchema: z
        .object({ platform: CatalogPlatform, username: CatalogUsername })
        .strict(),
    },
    async ({ platform, username }) => {
      const result = CatalogEnrichmentResponse.parse(
        await client.post("/v1/creators/catalog-enrichment", {
          platform,
          username,
        }),
      );
      return toolResult({
        ...result,
        agent_guidance:
          result.status === "already_in_catalog"
            ? "The creator is already indexed; create the reference search now."
            : "Indexing is queued and runs in the background, usually for a few minutes. Poll get_creator_catalog_status every 15-30 seconds and create the reference search once it reports ready_in_catalog. Do not call search_creators before that.",
        next_tool:
          result.status === "already_in_catalog"
            ? "search_creators"
            : "get_creator_catalog_status",
        next_arguments: { platform, username: result.username },
      });
    },
  );

  server.registerTool(
    "get_creator",
    {
      ...toolMetadata("get_creator"),
      inputSchema: z
        .object({
          platform: z
            .enum(["tiktok", "instagram"])
            .describe(
              "The detailed catalog lookup currently supports TikTok and Instagram.",
            ),
          selector: z.discriminatedUnion("type", [
            z
              .object({
                type: z.literal("creator_id"),
                creator_id: z.number().int().positive(),
              })
              .strict(),
            z
              .object({
                type: z.literal("origin_id"),
                origin_id: z.string().min(1).max(256),
              })
              .strict(),
            z
              .object({
                type: z.literal("username"),
                username: z.string().min(1).max(256),
              })
              .strict(),
          ]),
          recent_content_limit: z.number().int().min(0).max(10).default(0),
        })
        .strict(),
    },
    async ({ platform, selector, recent_content_limit }) => {
      const { type: _type, ...identity } = selector;
      return toolResult({
        ...z.object({ found: z.boolean(), creator: Creator.nullable() }).parse(
          await client.get(
            "/v1/creators/lookup",
            queryFrom({
              platform,
              ...identity,
              include_content: recent_content_limit > 0,
              content_limit: Math.max(1, recent_content_limit),
            }),
          ),
        ),
        agent_guidance:
          "These are creator-profile statistics, not campaign results. Email masking and unlock rules still apply. Detailed lookup currently supports TikTok and Instagram; use search/results for supported YouTube discovery.",
      });
    },
  );
}
