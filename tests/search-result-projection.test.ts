import { describe, expect, it } from "vitest";

import { projectSearchResultPage } from "../src/search-result-projection.js";

describe("projectSearchResultPage", () => {
  it("returns compact creator summaries for summary pages", () => {
    const result = projectSearchResultPage(
      {
        creators: [
          {
            origin_id: "creator_1",
            creator_id: 99,
            username: "mugs_daily",
            nickname: "Mugs Daily",
            biography: "Ceramic mugs, coffee routines, and kitchen styling.",
            profile_image_key: "private/profile.jpg",
            follower_count: 1200,
            average_engagement_rate: 0.08,
            average_views: 3400,
            score: 0.91,
            email: "creator@example.test",
            has_email: true,
            is_email_locked: true,
            categories: ["Home", "Coffee"],
            nested: { expensive: true },
          },
        ],
        total: 1,
        offset: 0,
        limit: 10,
      },
      "summary",
    );

    expect(result).toEqual({
      creators: [
        {
          origin_id: "creator_1",
          creator_id: 99,
          username: "mugs_daily",
          nickname: "Mugs Daily",
          bio_preview: "Ceramic mugs, coffee routines, and kitchen styling.",
          follower_count: 1200,
          engagement_rate: 0.08,
          average_views: 3400,
          score: 0.91,
          has_email: true,
          is_email_locked: true,
          categories: ["Home", "Coffee"],
        },
      ],
      total: 1,
      offset: 0,
      limit: 10,
      detail_level: "summary",
      has_more: false,
    });
  });

  it("preserves full creator rows when explicitly requested", () => {
    const result = projectSearchResultPage(
      {
        creators: [
          {
            origin_id: "creator_1",
            username: "mugs_daily",
            biography: "Ceramic mugs.",
            profile_image_key: "private/profile.jpg",
          },
        ],
        total: 1,
        offset: 0,
        limit: 1,
      },
      "full",
    );

    expect(result).toEqual({
      creators: [
        {
          origin_id: "creator_1",
          username: "mugs_daily",
          biography: "Ceramic mugs.",
          profile_image_key: "private/profile.jpg",
        },
      ],
      total: 1,
      offset: 0,
      limit: 1,
      detail_level: "full",
      has_more: false,
    });
  });

  it("adds pagination guidance when a search id and next page are available", () => {
    const result = projectSearchResultPage(
      {
        creators: [],
        total: 30,
        offset: 10,
        limit: 10,
      },
      "summary",
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toMatchObject({
      has_more: true,
      next_offset: 20,
      next_tool: "get_search_results",
      next_arguments: {
        search_id: "550e8400-e29b-41d4-a716-446655440000",
        offset: 20,
        limit: 10,
        detail_level: "summary",
      },
    });
  });
});
