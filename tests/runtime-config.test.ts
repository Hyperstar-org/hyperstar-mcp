import { describe, expect, it, vi } from "vitest";

import type {
  CliWorkspaceSelection,
  HyperstarMcpConfig,
} from "../src/config.js";
import {
  createDynamicHyperstarClient,
  createDynamicWorkspaceToolOptions,
} from "../src/runtime-config.js";
import { createHyperstarMcpServer } from "../src/server.js";
import { createToolHandlers } from "../src/tools.js";

class WorkspaceSelectionProbe implements CliWorkspaceSelection {
  selectedOrganizationId: string | undefined;
  readonly selectedOrganizationIds: string[] = [];

  constructor(selectedOrganizationId: string | undefined = undefined) {
    this.selectedOrganizationId = selectedOrganizationId;
  }

  async getSelectedOrganizationId(): Promise<string | undefined> {
    return this.selectedOrganizationId;
  }

  async setSelectedOrganizationId(organizationId: string): Promise<void> {
    this.selectedOrganizationIds.push(organizationId);
    this.selectedOrganizationId = organizationId;
  }
}

describe("reloadable runtime config", () => {
  it("reloads config for each HTTP call so same-process auth changes are visible", async () => {
    let config: HyperstarMcpConfig = {
      authMode: "unauthenticated",
      apiBaseUrl: "https://api.example.test",
    };
    const loadConfig = vi.fn(() => config);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            workspaces: [{ organization_id: "org_123", name: "Acme" }],
          }),
          { status: 200 },
        ),
    );
    const client = createDynamicHyperstarClient({ loadConfig, fetcher });

    await expect(client.get("/v1/workspaces")).rejects.toThrow(
      "Call start_browser_login, then complete_browser_login and select_workspace, or set HYPERSTAR_API_KEY.",
    );

    config = {
      authMode: "cli",
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      accessTokenProvider: {
        getAccessToken: async () => "access-token",
      },
      workspaceSelection: new WorkspaceSelectionProbe(undefined),
    };

    await expect(client.get("/v1/workspaces")).resolves.toEqual({
      workspaces: [{ organization_id: "org_123", name: "Acme" }],
    });
    expect(loadConfig).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestHeaders(fetcher, 0).Authorization).toBe(
      "Bearer access-token",
    );
  });

  it("resolves workspace guidance dynamically for CLI and service-account modes", async () => {
    let config: HyperstarMcpConfig = {
      authMode: "cli",
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      accessTokenProvider: {
        getAccessToken: async () => "access-token",
      },
      workspaceSelection: new WorkspaceSelectionProbe(undefined),
    };
    const loadConfig = vi.fn(() => config);
    const client = createDynamicHyperstarClient({
      loadConfig,
      fetcher: async () =>
        new Response(
          JSON.stringify({
            workspaces: [{ organization_id: "org_123", name: "Acme" }],
          }),
          { status: 200 },
        ),
    });
    const handlers = createToolHandlers(
      client,
      createDynamicWorkspaceToolOptions(loadConfig),
    );

    await expect(handlers.listWorkspaces()).resolves.toMatchObject({
      next_tool: "select_workspace",
      next_required_arguments: ["organization_id"],
    });

    config = {
      authMode: "service_account",
      apiBaseUrl: "https://api.example.test",
      apiKey: "hstar_test.secret",
    };

    await expect(handlers.listWorkspaces()).resolves.toMatchObject({
      next_tool: "hyperstar_whoami",
    });
    await expect(
      handlers.selectWorkspace({ organization_id: "org_123" }),
    ).rejects.toThrow("select_workspace requires local browser CLI auth");
  });

  it("uses one config snapshot for select_workspace verification and persistence", async () => {
    const workspaceSelection = new WorkspaceSelectionProbe(undefined);
    const configs: HyperstarMcpConfig[] = [
      {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider: {
          getAccessToken: async () => "cli-access-token",
        },
        workspaceSelection,
      },
      {
        authMode: "service_account",
        apiBaseUrl: "https://api.example.test",
        apiKey: "hstar_test.service-account-secret",
      },
    ];
    let configIndex = 0;
    const loadConfig = vi.fn(() => configs[configIndex++] ?? configs.at(-1)!);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            workspaces: [{ organization_id: "org_123", name: "Acme" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      const server = createHyperstarMcpServer(
        { authMode: "unauthenticated", apiBaseUrl: "https://api.example.test" },
        { loadConfig },
      );

      await expect(
        callRegisteredTool(server, "select_workspace", {
          organization_id: "org_123",
        }),
      ).resolves.toMatchObject({
        structuredContent: {
          selected_organization_id: "org_123",
        },
      });

      expect(loadConfig).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(requestHeaders(fetcher, 0).Authorization).toBe(
        "Bearer cli-access-token",
      );
      expect(requestHeaders(fetcher, 0)["x-hyperstar-api-key"]).toBeUndefined();
      expect(workspaceSelection.selectedOrganizationIds).toEqual(["org_123"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses one config snapshot for list_workspaces HTTP and guidance", async () => {
    const workspaceSelection = new WorkspaceSelectionProbe(undefined);
    const configs: HyperstarMcpConfig[] = [
      {
        authMode: "service_account",
        apiBaseUrl: "https://api.example.test",
        apiKey: "hstar_test.service-account-secret",
      },
      {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider: {
          getAccessToken: async () => "cli-access-token",
        },
        workspaceSelection,
      },
    ];
    let configIndex = 0;
    const loadConfig = vi.fn(() => configs[configIndex++] ?? configs.at(-1)!);
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            workspaces: [{ organization_id: "org_123", name: "Acme" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      const server = createHyperstarMcpServer(
        { authMode: "unauthenticated", apiBaseUrl: "https://api.example.test" },
        { loadConfig },
      );

      await expect(
        callRegisteredTool(server, "list_workspaces", {}),
      ).resolves.toMatchObject({
        structuredContent: {
          next_tool: "hyperstar_whoami",
        },
      });

      expect(loadConfig).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(requestHeaders(fetcher, 0)["x-hyperstar-api-key"]).toBe(
        "hstar_test.service-account-secret",
      );
      expect(requestHeaders(fetcher, 0).Authorization).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

type RegisteredToolHandler = (input: unknown) =>
  | Promise<{ readonly structuredContent?: Record<string, unknown> }>
  | {
      readonly structuredContent?: Record<string, unknown>;
    };

async function callRegisteredTool(
  server: ReturnType<typeof createHyperstarMcpServer>,
  toolName: string,
  input: unknown,
): Promise<{ readonly structuredContent?: Record<string, unknown> }> {
  const internals = server as unknown as {
    readonly _registeredTools: Record<
      string,
      { readonly handler: RegisteredToolHandler }
    >;
  };
  return await internals._registeredTools[toolName]!.handler(input);
}

function requestHeaders(
  fetcher: ReturnType<typeof vi.fn>,
  callIndex: number,
): Record<string, string> {
  return fetcher.mock.calls[callIndex]![1].headers as Record<string, string>;
}
