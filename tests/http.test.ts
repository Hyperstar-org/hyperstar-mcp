import { describe, expect, it, vi } from "vitest";

import { AUTH_CONFIGURATION_MESSAGE } from "../src/config.js";
import { HyperstarApiError, createHyperstarClient } from "../src/http.js";

const apiKey = "hstar_test_public.secret";
const config = {
  authMode: "service_account" as const,
  apiBaseUrl: "https://api.example.test",
  apiKey,
};

describe("createHyperstarClient", () => {
  it("sends the API key header and no bearer or workspace header", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await client.get("/v1/whoami");

    const headers = fetcher.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers["x-hyperstar-api-key"]).toBe(apiKey);
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Hyperstar-Organization-Id"]).toBeUndefined();
  });

  it("fails locally without auth instead of sending an unauthenticated request", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "unauthenticated",
        apiBaseUrl: "https://api.example.test",
      },
      fetcher,
    });

    await expect(client.get("/v1/whoami")).rejects.toThrow(
      AUTH_CONFIGURATION_MESSAGE,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not leak the API key in error message, detail, or stringified error", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ detail: `request used ${apiKey} and failed` }),
          { status: 500 },
        ),
    );
    const client = createHyperstarClient({ config, fetcher });

    let error: unknown;
    try {
      await client.get("/v1/whoami");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HyperstarApiError);
    const apiError = error as HyperstarApiError;
    expect(apiError.message).not.toContain(apiKey);
    expect(JSON.stringify(apiError.detail)).not.toContain(apiKey);
    expect(String(apiError)).not.toContain(apiKey);
    expect(JSON.stringify(apiError)).not.toContain(apiKey);
  });
});
