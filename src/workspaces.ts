import type { CliWorkspaceSelection, HyperstarMcpConfig } from "./config.js";
import type { HyperstarClient, JsonObject } from "./http.js";
import type { Surface } from "./surface.js";
import { WorkspaceListResponseSchema } from "./schemas.js";
import {
  BROWSER_LOGIN_WORKFLOW_SEQUENCE,
  CLI_SAFETY_NOTES,
  WORKFLOW_DATA_FLOW_NOTES,
  workflowGuideJson,
  workflowGuideResourceDefinitions,
} from "./workflow-content.js";

export type WorkspaceToolOptions = {
  readonly surface?: Surface;
  readonly authMode?: HyperstarMcpConfig["authMode"];
  readonly workspaceSelection?: CliWorkspaceSelection;
  readonly getAuthMode?: () =>
    HyperstarMcpConfig["authMode"] | Promise<HyperstarMcpConfig["authMode"]>;
  readonly getWorkspaceSelection?: () =>
    | CliWorkspaceSelection
    | undefined
    | Promise<CliWorkspaceSelection | undefined>;
};

/** List workspaces through the Product API workspace route. */
export async function listAvailableWorkspaces(
  client: HyperstarClient,
  options: WorkspaceToolOptions = {},
): Promise<JsonObject> {
  const payload = WorkspaceListResponseSchema.parse(
    await client.get("/v1/workspaces"),
  );
  const isCliAuth = (await resolveWorkspaceSelection(options)) !== undefined;
  return {
    workspaces: payload.workspaces.map(workspaceJson),
    next_tool: isCliAuth ? "select_workspace" : "hyperstar_whoami",
    ...(isCliAuth ? { next_required_arguments: ["organization_id"] } : {}),
    agent_guidance: isCliAuth
      ? "Call select_workspace with one returned organization_id, then call hyperstar_whoami."
      : "Service-account auth is already workspace-scoped. Call hyperstar_whoami next.",
  };
}

/** Persist a selected workspace after verifying the Product API lists it. */
export async function selectAvailableWorkspace(
  client: HyperstarClient,
  organizationId: string,
  options: WorkspaceToolOptions = {},
): Promise<JsonObject> {
  const workspaceSelection = await resolveWorkspaceSelection(options);
  if (workspaceSelection === undefined) {
    throw new Error("select_workspace requires local browser CLI auth");
  }
  const expectedAuthStateFingerprint =
    await workspaceSelection.getAuthStateFingerprint?.();

  const payload = WorkspaceListResponseSchema.parse(
    await client.get("/v1/workspaces"),
  );
  const selected = payload.workspaces.find(
    (workspace) => workspace.organization_id === organizationId,
  );
  if (selected === undefined) {
    throw new Error(`Workspace ${organizationId} is not available`);
  }

  await workspaceSelection.setSelectedOrganizationId(organizationId, {
    expectedAuthStateFingerprint,
  });

  return {
    selected_organization_id: organizationId,
    workspace: workspaceJson(selected),
    next_tool: "hyperstar_whoami",
    agent_guidance:
      "Workspace selected. Call hyperstar_whoami next to confirm the authenticated principal and scopes before mutating data.",
  };
}

/** Return the recommended Hyperstar agent workflow and send-safety notes. */
export async function getHyperstarWorkflowGuide(
  options: WorkspaceToolOptions = {},
): Promise<JsonObject> {
  if (options.surface === "hosted") return workflowGuideJson("hosted");
  const authMode = await resolveAuthMode(options);
  const workspaceSelection = await resolveWorkspaceSelection(options);
  if (authMode === "unauthenticated") {
    return {
      sequence: [...BROWSER_LOGIN_WORKFLOW_SEQUENCE],
      safety_notes: [
        "MCP tools and guides are discoverable before auth, but Product API workflow calls require start_browser_login/complete_browser_login or HYPERSTAR_API_KEY.",
        ...CLI_SAFETY_NOTES,
      ],
      data_flow_notes: [...WORKFLOW_DATA_FLOW_NOTES],
      resources: workflowGuideResourceDefinitions.map(
        (resource) => resource.uri,
      ),
    };
  }
  if (workspaceSelection === undefined) {
    return workflowGuideJson("service_account");
  }
  return workflowGuideJson("cli");
}

/** Resolve the current auth mode from dynamic options before static fallback. */
async function resolveAuthMode(
  options: WorkspaceToolOptions,
): Promise<HyperstarMcpConfig["authMode"] | undefined> {
  if (options.getAuthMode !== undefined) {
    return await options.getAuthMode();
  }
  return options.authMode;
}

/** Resolve the current workspace-selection port from dynamic or static options. */
async function resolveWorkspaceSelection(
  options: WorkspaceToolOptions,
): Promise<CliWorkspaceSelection | undefined> {
  if (options.getWorkspaceSelection !== undefined) {
    return await options.getWorkspaceSelection();
  }
  return options.workspaceSelection;
}

/** Convert a parsed workspace into JSON without undefined optional fields. */
function workspaceJson(workspace: {
  readonly organization_id: string;
  readonly name?: string | undefined;
  readonly role?: string | undefined;
}): JsonObject {
  return {
    organization_id: workspace.organization_id,
    ...(workspace.name === undefined ? {} : { name: workspace.name }),
    ...(workspace.role === undefined ? {} : { role: workspace.role }),
  };
}
