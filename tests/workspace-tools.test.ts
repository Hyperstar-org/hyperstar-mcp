import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

import type { HyperstarClient, JsonObject, JsonValue } from "../src/http.js";
import type { CliWorkspaceSelection } from "../src/config.js";
import { createHyperstarClient } from "../src/http.js";
import { createToolHandlers, registerHyperstarTools } from "../src/tools.js";

type RecordedCall =
  | {
      readonly method: "GET";
      readonly path: string;
      readonly query: URLSearchParams | undefined;
    }
  | {
      readonly method: "POST";
      readonly path: string;
      readonly body: JsonObject | undefined;
      readonly headers: Record<string, string> | undefined;
    }
  | {
      readonly method: "PATCH";
      readonly path: string;
      readonly body: JsonObject | undefined;
    };

class RecordingHyperstarClient implements HyperstarClient {
  async put(): Promise<JsonValue> {
    throw new Error("Unexpected PUT");
  }
  async delete(): Promise<JsonValue> {
    throw new Error("Unexpected DELETE");
  }
  readonly calls: RecordedCall[] = [];
  private readonly responses: JsonValue[];

  constructor(responses: readonly JsonValue[]) {
    this.responses = [...responses];
  }

  async get(path: string, query?: URLSearchParams): Promise<JsonValue> {
    this.calls.push({
      method: "GET",
      path,
      query: query === undefined ? undefined : new URLSearchParams(query),
    });
    return this.shiftResponse();
  }

  async post(
    path: string,
    body?: JsonObject,
    headers?: Record<string, string>,
  ): Promise<JsonValue> {
    this.calls.push({ method: "POST", path, body, headers });
    return this.shiftResponse();
  }

  async patch(path: string, body?: JsonObject): Promise<JsonValue> {
    this.calls.push({ method: "PATCH", path, body });
    return this.shiftResponse();
  }

  private shiftResponse(): JsonValue {
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("No fake response queued");
    }
    return response;
  }
}

class WorkspaceSelectionProbe implements CliWorkspaceSelection {
  selectedOrganizationId: string | undefined;
  authStateFingerprint: string | undefined = "auth-state-1";

  constructor(selectedOrganizationId: string | undefined) {
    this.selectedOrganizationId = selectedOrganizationId;
  }

  async getAuthStateFingerprint(): Promise<string | undefined> {
    return this.authStateFingerprint;
  }

  async getSelectedOrganizationId(): Promise<string | undefined> {
    return this.selectedOrganizationId;
  }

  async setSelectedOrganizationId(
    organizationId: string,
    options: { readonly expectedAuthStateFingerprint?: string } = {},
  ): Promise<void> {
    if (
      options.expectedAuthStateFingerprint !== undefined &&
      this.authStateFingerprint !== options.expectedAuthStateFingerprint
    ) {
      throw new Error(
        "Hyperstar auth changed while selecting the workspace; run list_workspaces again",
      );
    }
    this.selectedOrganizationId = organizationId;
  }
}

describe("workspace-aware MCP runtime", () => {
  it("listWorkspaces returns service-account next-step guidance without select_workspace", async () => {
    const client = new RecordingHyperstarClient([
      {
        workspaces: [
          { organization_id: "org_123", name: "Acme", role: "admin" },
        ],
      },
    ]);

    const result = await createToolHandlers(client).listWorkspaces();

    expect(result).toMatchObject({
      workspaces: [{ organization_id: "org_123", name: "Acme", role: "admin" }],
    });
    expect(result.next_tool).toBe("hyperstar_whoami");
    expect(result.next_required_arguments).toBeUndefined();
    expect(client.calls).toEqual([
      { method: "GET", path: "/v1/workspaces", query: undefined },
    ]);
  });

  it("listWorkspaces returns CLI workspace-selection guidance in local browser auth", async () => {
    const client = new RecordingHyperstarClient([
      {
        workspaces: [
          { organization_id: "org_123", name: "Acme", role: "admin" },
        ],
      },
    ]);
    const workspaceSelection = new WorkspaceSelectionProbe(undefined);

    const result = await createToolHandlers(client, {
      workspaceSelection,
    }).listWorkspaces();

    expect(result.next_tool).toBe("select_workspace");
    expect(result.next_required_arguments).toEqual(["organization_id"]);
  });

  it("selectWorkspace persists the selected workspace only after it is listed", async () => {
    const client = new RecordingHyperstarClient([
      {
        workspaces: [
          { organization_id: "org_123", name: "Acme", role: "member" },
          { organization_id: "org_456", name: "Beta", role: "admin" },
        ],
      },
    ]);
    const workspaceSelection = new WorkspaceSelectionProbe("org_123");

    const result = await createToolHandlers(client, {
      workspaceSelection,
    }).selectWorkspace({ organization_id: "org_456" });

    expect(result).toMatchObject({
      selected_organization_id: "org_456",
      workspace: { organization_id: "org_456", name: "Beta", role: "admin" },
    });
    expect(result.next_tool).toBe("hyperstar_whoami");
    await expect(workspaceSelection.getSelectedOrganizationId()).resolves.toBe(
      "org_456",
    );
  });

  it("selectWorkspace does not persist when the requested workspace is unavailable", async () => {
    const client = new RecordingHyperstarClient([
      {
        workspaces: [{ organization_id: "org_123", name: "Acme" }],
      },
    ]);
    const workspaceSelection = new WorkspaceSelectionProbe("org_123");

    await expect(
      createToolHandlers(client, {
        workspaceSelection,
      }).selectWorkspace({ organization_id: "org_456" }),
    ).rejects.toThrow("Workspace org_456 is not available");

    await expect(workspaceSelection.getSelectedOrganizationId()).resolves.toBe(
      "org_123",
    );
  });

  it("selectWorkspace does not persist when auth changes after workspace verification", async () => {
    const client = new RecordingHyperstarClient([
      {
        workspaces: [{ organization_id: "org_456", name: "Beta" }],
      },
    ]);
    const workspaceSelection = new WorkspaceSelectionProbe("org_123");
    const setSelectedOrganizationId = vi.spyOn(
      workspaceSelection,
      "setSelectedOrganizationId",
    );
    setSelectedOrganizationId.mockImplementationOnce(async function (
      this: WorkspaceSelectionProbe,
      organizationId,
      options,
    ) {
      this.authStateFingerprint = "auth-state-2";
      return WorkspaceSelectionProbe.prototype.setSelectedOrganizationId.call(
        this,
        organizationId,
        options,
      );
    });

    await expect(
      createToolHandlers(client, {
        workspaceSelection,
      }).selectWorkspace({ organization_id: "org_456" }),
    ).rejects.toThrow(
      "Hyperstar auth changed while selecting the workspace; run list_workspaces again",
    );

    await expect(workspaceSelection.getSelectedOrganizationId()).resolves.toBe(
      "org_123",
    );
  });

  it("selectWorkspace requires local CLI auth workspace selection", async () => {
    const client = new RecordingHyperstarClient([
      {
        workspaces: [
          { organization_id: "org_service", name: "Service", role: "admin" },
        ],
      },
    ]);

    await expect(
      createToolHandlers(client).selectWorkspace({
        organization_id: "org_service",
      }),
    ).rejects.toThrow("select_workspace requires local browser CLI auth");
    expect(client.calls).toEqual([]);
  });

  it("getHyperstarWorkflowGuide returns the CLI-authenticated sequence and safety notes", async () => {
    const workspaceSelection = new WorkspaceSelectionProbe(undefined);
    const guide = await createToolHandlers(new RecordingHyperstarClient([]), {
      workspaceSelection,
    }).getHyperstarWorkflowGuide();

    expect(guide.sequence).toEqual([
      "list_workspaces",
      "select_workspace",
      "hyperstar_whoami",
      "search_creators",
      "list_campaigns or create_campaign",
      "save_search_results_to_campaign",
      "list_campaign_creators",
      "start_email_unlock and poll get_email_unlock_job when selected recipients are locked",
      "check_bulk_email_readiness",
      "WARNING: start_bulk_email and send_inbox_reply perform real sends.",
    ]);
    expect(guide.safety_notes).toEqual(
      expect.arrayContaining([
        "start_bulk_email and send_inbox_reply perform real sends.",
        "Run list_campaigns or create_campaign before save_search_results_to_campaign when the user has not supplied a campaign_id.",
      ]),
    );
    expect(JSON.stringify(guide)).toContain("search_id");
    expect(JSON.stringify(guide)).toContain("recipient_target");
    expect(JSON.stringify(guide)).toContain("get_inbox_thread_messages");
    expect(JSON.stringify(guide)).toContain("full message history");
    expect(JSON.stringify(guide)).toContain("send_confirmation");
    expect(JSON.stringify(guide)).toContain("user_authorized");
  });

  it("getHyperstarWorkflowGuide points unauthenticated MCP clients at browser-login tools", async () => {
    const guide = await createToolHandlers(new RecordingHyperstarClient([]), {
      authMode: "unauthenticated",
    }).getHyperstarWorkflowGuide();

    expect(guide.sequence).toEqual([
      "start_browser_login",
      "complete_browser_login",
      "list_workspaces",
      "select_workspace",
      "hyperstar_whoami",
      "search_creators",
      "list_campaigns or create_campaign",
      "save_search_results_to_campaign",
      "list_campaign_creators",
      "start_email_unlock and poll get_email_unlock_job when selected recipients are locked",
      "check_bulk_email_readiness",
      "WARNING: start_bulk_email and send_inbox_reply perform real sends.",
    ]);
    expect(JSON.stringify(guide)).toContain("start_browser_login");
    expect(JSON.stringify(guide)).not.toContain("run `hyperstar login`");
  });

  it("getHyperstarWorkflowGuide omits workspace selection in service-account mode", async () => {
    const guide = await createToolHandlers(
      new RecordingHyperstarClient([]),
    ).getHyperstarWorkflowGuide();

    expect(guide.sequence).toEqual([
      "list_workspaces",
      "hyperstar_whoami",
      "search_creators",
      "list_campaigns or create_campaign",
      "save_search_results_to_campaign",
      "list_campaign_creators",
      "start_email_unlock and poll get_email_unlock_job when selected recipients are locked",
      "check_bulk_email_readiness",
      "WARNING: start_bulk_email and send_inbox_reply perform real sends.",
    ]);
    expect(guide.safety_notes).toEqual(
      expect.arrayContaining([
        "Service-account auth is already workspace-scoped; select_workspace is only for local browser CLI auth.",
        "Run list_campaigns or create_campaign before save_search_results_to_campaign when the user has not supplied a campaign_id.",
      ]),
    );
  });

  it("uses the latest selected workspace for later CLI-authenticated requests", async () => {
    const workspaceSelection = new WorkspaceSelectionProbe("org_123");
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
        workspaceSelection,
      },
      fetcher,
    });

    await client.get("/v1/inbox");
    workspaceSelection.selectedOrganizationId = "org_456";
    await client.get("/v1/inbox");

    expect(requestHeaders(fetcher, 0)["X-Hyperstar-Organization-Id"]).toBe(
      "org_123",
    );
    expect(requestHeaders(fetcher, 1)["X-Hyperstar-Organization-Id"]).toBe(
      "org_456",
    );
  });

  it("registered select_workspace uses the injected CLI workspace selection port", async () => {
    const workspaceSelection = new WorkspaceSelectionProbe("org_123");
    const server = new McpServer({ name: "hyperstar-test", version: "0.1.0" });
    const client = createHyperstarClient({
      config: {
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        accessTokenProvider: {
          getAccessToken: async () => "access-token",
        },
        workspaceSelection,
      },
      fetcher: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              workspaces: [
                { organization_id: "org_456", name: "Beta", role: "admin" },
              ],
            }),
          ),
      ),
    });
    registerHyperstarTools(server, client, { workspaceSelection });

    await registeredToolHandler(
      server,
      "select_workspace",
    )({
      organization_id: "org_456",
    });

    await expect(workspaceSelection.getSelectedOrganizationId()).resolves.toBe(
      "org_456",
    );
  });
});

function requestHeaders(
  fetcher: ReturnType<typeof vi.fn>,
  callIndex: number,
): Record<string, string> {
  return fetcher.mock.calls[callIndex]![1].headers as Record<string, string>;
}

function registeredToolHandler(
  server: McpServer,
  toolName: string,
): (input: unknown) => Promise<unknown> {
  const internals = server as unknown as {
    readonly _registeredTools: Record<
      string,
      { readonly handler: (input: unknown) => Promise<unknown> }
    >;
  };
  return internals._registeredTools[toolName]!.handler;
}
