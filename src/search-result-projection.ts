import type { JsonObject, JsonValue } from "./http.js";
import { compactJsonObject } from "./tool-http-helpers.js";

export type SearchResultDetailLevel = "summary" | "full";

export type SearchResultPage = {
  readonly creators: readonly JsonObject[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
};

/** Project search results to the requested MCP-facing detail level. */
export function projectSearchResultPage(
  page: SearchResultPage,
  detailLevel: SearchResultDetailLevel,
  searchId?: string,
  options: { readonly deterministicNextPage?: boolean } = {},
): JsonObject {
  const pagination = paginationGuidance(page, searchId, options);
  if (detailLevel === "full") {
    return { ...page, detail_level: detailLevel, ...pagination };
  }
  return {
    ...page,
    creators: page.creators.map(compactCreatorSummary),
    detail_level: detailLevel,
    ...pagination,
  };
}

/** Return a compact creator summary suitable for model context. */
function compactCreatorSummary(creator: JsonObject): JsonObject {
  return compactJsonObject([
    ["origin_id", stringValue(creator.origin_id)],
    ["creator_id", numberValue(creator.creator_id)],
    ["username", stringValue(creator.username)],
    ["nickname", stringValue(creator.nickname)],
    ["platform", stringValue(creator.platform)],
    ["region", stringValue(creator.region)],
    ["country", stringValue(creator.country)],
    ["language", stringValue(creator.language)],
    ["bio_preview", bioPreview(creator.biography)],
    ["follower_count", numberValue(creator.follower_count)],
    [
      "engagement_rate",
      firstNumber(creator.average_engagement_rate, creator.engagement_rate),
    ],
    [
      "average_views",
      firstNumber(creator.average_views, creator.avg_video_views),
    ],
    ["score", numberValue(creator.score)],
    ["has_email", booleanValue(creator.has_email)],
    ["is_email_locked", booleanValue(creator.is_email_locked)],
    ["categories", stringArrayValue(creator.categories)],
  ]);
}

function bioPreview(value: JsonValue | undefined): string | undefined {
  const text = stringValue(value)?.replace(/\s+/g, " ").trim();
  if (text === undefined || text.length === 0) {
    return undefined;
  }
  return text.length <= 180 ? text : `${text.slice(0, 177)}...`;
}

function firstNumber(
  ...values: readonly (JsonValue | undefined)[]
): number | undefined {
  for (const value of values) {
    const number = numberValue(value);
    if (number !== undefined) {
      return number;
    }
  }
  return undefined;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanValue(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayValue(
  value: JsonValue | undefined,
): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return undefined;
  }
  return value;
}

function paginationGuidance(
  page: SearchResultPage,
  searchId: string | undefined,
  options: { readonly deterministicNextPage?: boolean },
): JsonObject {
  const nextOffset = page.offset + page.limit;
  const hasMore = nextOffset < page.total;
  const includeDeterministicNext =
    options.deterministicNextPage !== false &&
    hasMore &&
    searchId !== undefined;
  return compactJsonObject([
    ["has_more", hasMore],
    ["next_offset", hasMore ? nextOffset : undefined],
    [
      "agent_guidance",
      searchId === undefined
        ? undefined
        : "Use search_id server-side for campaign import. Page with get_search_results only when the user needs more creator summaries; do not load every creator into context.",
    ],
    ["next_tool", includeDeterministicNext ? "get_search_results" : undefined],
    [
      "next_arguments",
      includeDeterministicNext
        ? {
            search_id: searchId,
            offset: nextOffset,
            limit: page.limit,
            detail_level: "summary",
          }
        : undefined,
    ],
  ]);
}
