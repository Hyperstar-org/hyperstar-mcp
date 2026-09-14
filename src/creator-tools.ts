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

export function registerCreatorTools(
  server: ToolRegistrar,
  client: HyperstarClient,
): void {
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
