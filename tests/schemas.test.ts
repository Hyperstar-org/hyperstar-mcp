import { describe, expect, it } from "vitest";

import {
  CampaignCreatorsResponseSchema,
  JsonObjectSchema,
  JsonValueSchema,
  SearchCreatedResponseSchema,
  SearchResultsResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceSchema,
  WhoamiResponseSchema,
} from "../src/schemas.js";

describe("JsonValueSchema", () => {
  it("accepts nested JSON values", () => {
    const payload = {
      creator: {
        id: "creator-1",
        metrics: {
          score: 98.5,
          flags: [true, false, null],
        },
      },
      tags: ["fashion", { region: "us" }],
    };

    expect(JsonValueSchema.parse(payload)).toEqual(payload);
    expect(JsonObjectSchema.parse(payload)).toEqual(payload);
  });

  it("rejects functions and undefined values", () => {
    expect(JsonValueSchema.safeParse(() => "not-json").success).toBe(false);
    expect(JsonValueSchema.safeParse(undefined).success).toBe(false);
    expect(JsonObjectSchema.safeParse({ missing: undefined }).success).toBe(
      false,
    );
    expect(JsonObjectSchema.safeParse({ callback: () => null }).success).toBe(
      false,
    );
  });

  it("rejects class instances", () => {
    class NotJson {
      readonly value = "not-json";
    }

    expect(JsonValueSchema.safeParse(new NotJson()).success).toBe(false);
  });
});

describe("WhoamiResponseSchema", () => {
  it("parses service-account metadata", () => {
    const parsed = WhoamiResponseSchema.parse({
      actor_type: "service_account",
      user_id: null,
      service_account_id: "svc_123",
      organization_id: "org_123",
      scopes: ["search:read", "campaigns:write"],
      capabilities: {
        search: true,
        campaigns_read: true,
        campaigns_write: true,
        bulk_email: false,
        inbox_read: false,
        inbox_write: false,
      },
    });

    expect(parsed).toMatchObject({
      actor_type: "service_account",
      user_id: null,
      service_account_id: "svc_123",
      organization_id: "org_123",
      scopes: ["search:read", "campaigns:write"],
    });
    expect(parsed.capabilities.campaigns_write).toBe(true);
    expect(parsed.capabilities.bulk_email).toBe(false);
  });
});

describe("WorkspaceSchema", () => {
  it("accepts backend organization IDs because workspace IDs are not UUIDs", () => {
    expect(
      WorkspaceSchema.parse({
        organization_id: "org_123",
        name: "Acme",
        role: "admin",
      }),
    ).toEqual({ organization_id: "org_123", name: "Acme", role: "admin" });
  });

  it("rejects workspace records missing organization_id", () => {
    expect(WorkspaceSchema.safeParse({ name: "Acme" }).success).toBe(false);
  });
});

describe("WorkspaceListResponseSchema", () => {
  it("parses workspace list responses", () => {
    expect(
      WorkspaceListResponseSchema.parse({
        workspaces: [
          { organization_id: "org_123", name: "Acme", role: "admin" },
        ],
      }),
    ).toEqual({
      workspaces: [{ organization_id: "org_123", name: "Acme", role: "admin" }],
    });
  });

  it("rejects malformed workspace list responses", () => {
    expect(WorkspaceListResponseSchema.safeParse({}).success).toBe(false);
    expect(
      WorkspaceListResponseSchema.safeParse({
        workspaces: [{ name: "Missing ID" }],
      }).success,
    ).toBe(false);
  });
});

describe("SearchCreatedResponseSchema", () => {
  it("accepts UUID search IDs", () => {
    expect(
      SearchCreatedResponseSchema.parse({
        search_id: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toEqual({
      search_id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects responses missing search_id", () => {
    expect(SearchCreatedResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-UUID search IDs", () => {
    expect(
      SearchCreatedResponseSchema.safeParse({ search_id: "search-123" })
        .success,
    ).toBe(false);
  });
});

describe("SearchResultsResponseSchema", () => {
  it("parses creator result pages with core pagination shape", () => {
    const parsed = SearchResultsResponseSchema.parse({
      creators: [
        {
          origin_id: "creator-1",
          nested: { categories: ["beauty", "fashion"] },
        },
      ],
      total: 25,
      offset: 10,
      limit: 5,
    });

    expect(parsed.creators).toHaveLength(1);
    expect(parsed.total).toBe(25);
    expect(parsed.offset).toBe(10);
    expect(parsed.limit).toBe(5);
  });

  it("rejects fractional, negative, and zero pagination values", () => {
    const validPage = {
      creators: [],
      total: 1,
      offset: 0,
      limit: 1,
    };

    expect(
      SearchResultsResponseSchema.safeParse({ ...validPage, total: 1.5 })
        .success,
    ).toBe(false);
    expect(
      SearchResultsResponseSchema.safeParse({ ...validPage, offset: -1 })
        .success,
    ).toBe(false);
    expect(
      SearchResultsResponseSchema.safeParse({ ...validPage, limit: 0 }).success,
    ).toBe(false);
  });
});

describe("CampaignCreatorsResponseSchema", () => {
  it("parses campaign creator pages with core pagination shape", () => {
    const parsed = CampaignCreatorsResponseSchema.parse({
      influencers: [
        {
          id: "influencer-1",
          profile: { handles: ["creator_one"] },
        },
      ],
      total: 12,
      limit: 6,
      offset: 0,
    });

    expect(parsed.creators).toHaveLength(1);
    expect(parsed.creators[0]).toMatchObject({ id: "influencer-1" });
    expect(parsed.total).toBe(12);
    expect(parsed.limit).toBe(6);
    expect(parsed.offset).toBe(0);
  });

  it("rejects fractional, negative, and zero pagination values", () => {
    const validPage = {
      influencers: [],
      total: 1,
      limit: 1,
      offset: 0,
    };

    expect(
      CampaignCreatorsResponseSchema.safeParse({ ...validPage, total: 1.5 })
        .success,
    ).toBe(false);
    expect(
      CampaignCreatorsResponseSchema.safeParse({ ...validPage, offset: -1 })
        .success,
    ).toBe(false);
    expect(
      CampaignCreatorsResponseSchema.safeParse({ ...validPage, limit: 0 })
        .success,
    ).toBe(false);
  });
});
