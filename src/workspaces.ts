import {
  AUTH_CONFIGURATION_MESSAGE,
  type HyperstarMcpConfig,
} from "./config.js";
import type { HyperstarClient, JsonObject } from "./http.js";
import type { Surface } from "./surface.js";
import { WorkspaceListResponseSchema } from "./schemas.js";
import {
  SERVICE_ACCOUNT_SAFETY_NOTES,
  SERVICE_ACCOUNT_WORKFLOW_SEQUENCE,
  WORKFLOW_DATA_FLOW_NOTES,
  workflowGuideJson,
  workflowGuideResourceDefinitions,
} from "./workflow-content.js";

export type WorkspaceToolOptions = {
  readonly surface?: Surface;
  /** Hosted connector grant breadth, reported by the Product API at preflight. */
  readonly connectorWorkspaceAccess?: "single" | "all";
  readonly authMode?: HyperstarMcpConfig["authMode"];
};

/** List workspaces through the Product API workspace route. */
export async function listAvailableWorkspaces(
  client: HyperstarClient,
  options: WorkspaceToolOptions = {},
): Promise<JsonObject> {
  const payload = WorkspaceListResponseSchema.parse(
    await client.get("/v1/workspaces"),
  );
  const workspaces = payload.workspaces.map(workspaceJson);
  if (options.surface === "hosted") {
    const all = options.connectorWorkspaceAccess === "all";
    return {
      workspaces,
      connector_workspace_access: all ? "all" : "single",
      agent_guidance: all
        ? "Ask the user which workspace to use unless they already said, then pass its organization_id as workspace_id on every Hyperstar tool call in this conversation. Do not switch workspaces without the user's instruction."
        : "This connector is bound to the one workspace selected during consent. To work in another workspace, the user reconnects and chooses it, or chooses All my workspaces.",
    };
  }
  return {
    workspaces,
    next_tool: "hyperstar_whoami",
    agent_guidance:
      "The API key is bound to one workspace; there is nothing to select. Call hyperstar_whoami next.",
  };
}

/** Return the recommended Hyperstar agent workflow and send-safety notes. */
export function getHyperstarWorkflowGuide(
  options: WorkspaceToolOptions = {},
): JsonObject {
  if (options.surface === "hosted") return workflowGuideJson("hosted");
  if (options.authMode === "unauthenticated") {
    return {
      sequence: [...SERVICE_ACCOUNT_WORKFLOW_SEQUENCE],
      safety_notes: [
        `MCP tools and guides are discoverable before auth, but Product API workflow calls fail until auth is configured. ${AUTH_CONFIGURATION_MESSAGE}`,
        ...SERVICE_ACCOUNT_SAFETY_NOTES,
      ],
      data_flow_notes: [...WORKFLOW_DATA_FLOW_NOTES],
      resources: workflowGuideResourceDefinitions.map(
        (resource) => resource.uri,
      ),
    };
  }
  return workflowGuideJson("service_account");
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
