import { describe, expect, it, vi } from "vitest";

import { HyperstarApiError, createHyperstarClient } from "../src/http.js";

const apiKey = "hstar_test_public.secret";
const config = {
  authMode: "service_account" as const,
  apiBaseUrl: "https://api.example.test",
  apiKey,
};

describe("createHyperstarClient", () => {
  it("fails API calls locally with auth guidance in unauthenticated discovery mode", async () => {
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
      "Call start_browser_login, then complete_browser_login and select_workspace, or set HYPERSTAR_API_KEY.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the service-account API key header", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config,
      fetcher,
    });

    await client.get("/v1/whoami");

    const [, init] = fetcher.mock.calls[0]!;
    expect(
      (init?.headers as Record<string, string>)["x-hyperstar-api-key"],
    ).toBe("hstar_test_public.secret");
  });

  it("sends CLI bearer and selected workspace headers", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider: {
          getAccessToken: async () => "access-token",
        },
        workspaceSelection: {
          getSelectedOrganizationId: async () => "org_123",
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });

    await client.get("/v1/whoami");

    expect(requestHeaders(fetcher).Authorization).toBe("Bearer access-token");
    expect(requestHeaders(fetcher)["X-Hyperstar-Organization-Id"]).toBe(
      "org_123",
    );
    expect(requestHeaders(fetcher)["x-hyperstar-api-key"]).toBeUndefined();
  });

  it("builds CLI request headers from one auth-state snapshot", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        requestAuthSnapshotProvider: {
          getRequestAuthSnapshot: async () => ({
            apiBaseUrl: "https://api.example.test",
            appBaseUrl: "https://app.example.test",
            accessToken: "access-token-for-org-123",
            selectedOrganizationId: "org_123",
          }),
        },
        accessTokenProvider: {
          getAccessToken: async () => {
            throw new Error("access token must come from the request snapshot");
          },
        },
        workspaceSelection: {
          getSelectedOrganizationId: async () => {
            throw new Error("workspace must come from the request snapshot");
          },
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });

    await client.get("/v1/whoami");

    expect(requestHeaders(fetcher).Authorization).toBe(
      "Bearer access-token-for-org-123",
    );
    expect(requestHeaders(fetcher)["X-Hyperstar-Organization-Id"]).toBe(
      "org_123",
    );
  });

  it("refuses to send a CLI token when the auth snapshot API origin differs from the request config", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api-a.example.test",
        appBaseUrl: "https://app-a.example.test",
        requestAuthSnapshotProvider: {
          getRequestAuthSnapshot: async () => ({
            apiBaseUrl: "https://api-b.example.test",
            appBaseUrl: "https://app-b.example.test",
            accessToken: "access-token-for-api-b",
          }),
        },
        accessTokenProvider: {
          getAccessToken: async () => {
            throw new Error("access token must come from the request snapshot");
          },
        },
        workspaceSelection: {
          getSelectedOrganizationId: async () => undefined,
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });

    await expect(client.get("/v1/workspaces")).rejects.toThrow(
      "Hyperstar auth changed while preparing the request; call the tool again",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails locally when CLI auth has no selected workspace for product API paths", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider: {
          getAccessToken: async () => "access-token",
        },
        workspaceSelection: {
          getSelectedOrganizationId: async () => undefined,
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });

    await expect(client.get("/v1/inbox")).rejects.toThrow(
      "Run `hyperstar workspaces use <workspace_id>` before calling Product API routes",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("gets a refreshed CLI access token before sending a request", async () => {
    const accessTokenProvider = {
      getAccessToken: vi.fn(async () => "refreshed-access-token"),
    };
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider,
        workspaceSelection: {
          getSelectedOrganizationId: async () => "org_123",
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });

    await client.get("/v1/whoami");

    expect(accessTokenProvider.getAccessToken).toHaveBeenCalledOnce();
    expect(requestHeaders(fetcher).Authorization).toBe(
      "Bearer refreshed-access-token",
    );
  });

  it("refreshes and retries once when the backend rejects a CLI bearer token", async () => {
    const accessTokenProvider = {
      getAccessToken: vi.fn(async () => "stale-access-token"),
      refreshAccessToken: vi.fn(async () => "fresh-access-token"),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "expired" }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider,
        workspaceSelection: {
          getSelectedOrganizationId: async () => "org_123",
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });

    await expect(client.get("/v1/whoami")).resolves.toEqual({ ok: true });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(accessTokenProvider.refreshAccessToken).toHaveBeenCalledOnce();
    expect(
      (fetcher.mock.calls[0]![1].headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer stale-access-token");
    expect(
      (fetcher.mock.calls[1]![1].headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer fresh-access-token");
  });

  it("sends the accept header", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await client.get("/v1/whoami");

    expect(requestHeaders(fetcher).accept).toBe("application/json");
  });

  it("explains campaign slot entitlement failures in agent-friendly language", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail: {
              error: "ENTITLEMENT_EXCEEDED",
              feature: "campaign_active",
              current: 0,
              limit: 10,
              remaining: 0,
            },
          }),
          { status: 402 },
        ),
    );
    const client = createHyperstarClient({ config, fetcher });

    await expect(
      client.post("/v1/campaigns", { name: "Test" }),
    ).rejects.toThrow("Campaign slots are maxed out for this workspace");
  });

  it("sends the content-type header only when a body exists", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await client.get("/v1/whoami");
    await client.post("/v1/inbox", { note: "hello" });

    const getHeaders = fetcher.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    const postHeaders = fetcher.mock.calls[1]![1].headers as Record<
      string,
      string
    >;
    expect(getHeaders["content-type"]).toBeUndefined();
    expect(postHeaders["content-type"]).toBe("application/json");
  });

  it("sends JSON bodies for POST and PATCH", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await client.post("/v1/inbox", { label: "urgent" });
    await client.patch("/v1/inbox/thread-1", { archived: true });

    expect(fetcher.mock.calls[0]![1].body).toBe('{"label":"urgent"}');
    expect(fetcher.mock.calls[1]![1].body).toBe('{"archived":true}');
  });

  it("merges extra POST headers", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await client.post(
      "/v1/inbox",
      { label: "urgent" },
      { "Idempotency-Key": "message-123" },
    );

    expect(requestHeaders(fetcher)["Idempotency-Key"]).toBe("message-123");
  });

  it.each([
    "https://attacker.test/x",
    "//attacker.test/x",
    "/\\\\attacker.test/x",
  ])("rejects path override %s before calling fetch", async (path) => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await expect(client.get(path)).rejects.toThrow(
      "Hyperstar API path must be root-relative",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("parses successful JSON responses", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "whoami", scopes: ["inbox:read"] }), {
          status: 200,
        }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await expect(client.get("/v1/whoami")).resolves.toEqual({
      id: "whoami",
      scopes: ["inbox:read"],
    });
  });

  it("parses empty responses as null", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const client = createHyperstarClient({ config, fetcher });

    await expect(client.patch("/v1/inbox/thread-1")).resolves.toBeNull();
  });

  it("rejects non-JSON error responses as HyperstarApiError with raw text detail", async () => {
    const fetcher = vi.fn(
      async () => new Response("upstream unavailable", { status: 502 }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await expect(client.get("/v1/whoami")).rejects.toMatchObject({
      status: 502,
      detail: "upstream unavailable",
      retryable: true,
    });
    await expect(client.get("/v1/whoami")).rejects.toBeInstanceOf(
      HyperstarApiError,
    );
  });

  it.each([
    [429, true],
    [500, true],
    [403, false],
  ])("marks status %s retryable as %s", async (status, retryable) => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "request failed" }), { status }),
    );
    const client = createHyperstarClient({ config, fetcher });

    await expect(client.get("/v1/whoami")).rejects.toMatchObject({
      status,
      retryable,
    });
  });

  it("normalizes API errors without leaking secrets", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ detail: "Missing required scope: inbox:write" }),
          { status: 403 },
        ),
    );
    const client = createHyperstarClient({
      config,
      fetcher,
    });

    await expect(client.get("/v1/inbox")).rejects.toMatchObject({
      status: 403,
      detail: "Missing required scope: inbox:write",
      retryable: false,
    });
    await expect(client.get("/v1/inbox")).rejects.toBeInstanceOf(
      HyperstarApiError,
    );
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

  it("redacts API keys from nested error object keys and values", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail: {
              [`key ${apiKey}`]: "top-level key",
              nested: {
                [`nested ${apiKey}`]: [
                  `array value ${apiKey}`,
                  { safe: `object value ${apiKey}` },
                ],
              },
            },
          }),
          { status: 500 },
        ),
    );
    const client = createHyperstarClient({ config, fetcher });
    const apiError = (await captureRejectedError(() =>
      client.get("/v1/whoami"),
    )) as HyperstarApiError;

    expect(apiError.message).not.toContain(apiKey);
    expect(JSON.stringify(apiError.detail)).not.toContain(apiKey);
    expect(String(apiError)).not.toContain(apiKey);
    expect(JSON.stringify(apiError)).not.toContain(apiKey);
  });

  it("does not leak CLI bearer tokens in API errors", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            detail: "request used Bearer access-token and failed",
          }),
          { status: 500 },
        ),
    );
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider: {
          getAccessToken: async () => "access-token",
        },
        workspaceSelection: {
          getSelectedOrganizationId: async () => "org_123",
          setSelectedOrganizationId: async () => undefined,
        },
      },
      fetcher,
    });
    const apiError = (await captureRejectedError(() =>
      client.get("/v1/whoami"),
    )) as HyperstarApiError;

    expect(apiError.message).not.toContain("access-token");
    expect(JSON.stringify(apiError.detail)).not.toContain("access-token");
    expect(String(apiError)).not.toContain("access-token");
  });
});

function requestHeaders(
  fetcher: ReturnType<typeof vi.fn>,
): Record<string, string> {
  return fetcher.mock.calls[0]![1].headers as Record<string, string>;
}

async function captureRejectedError(
  action: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected action to reject");
}
