import type { HyperstarClient } from "./http.js";

import { registerInboxTools } from "./inbox-tool-registration.js";
import { getEmailUnlockJob, startEmailUnlock } from "./email-unlock-tools.js";

import { toolResult } from "./tool-result.js";

import { toolMetadata } from "./tool-metadata.js";

import {
  BulkEmailJobInputSchema,
  CampaignCreatorsInputSchema,
  CheckBulkEmailReadinessDiscoveryInputSchema,
  CreateCampaignInputSchema,
  EmailUnlockJobInputSchema,
  GetSearchResultsInputSchema,
  ListCampaignsInputSchema,
  ListWorkspacesInputSchema,
  SaveSearchResultsToCampaignInputSchema,
  SearchCreatorsInputSchema,
  SelectWorkspaceInputSchema,
  StartBulkEmailDiscoveryInputSchema,
  StartEmailUnlockInputSchema,
  WorkflowGuideInputSchema,
  WhoamiInputSchema,
  normalizeCheckBulkEmailReadinessInput,
  normalizeStartBulkEmailInput,
} from "./tool-inputs.js";
import type { ToolRegistrar } from "./tool-registrar.js";
import {
  getHyperstarWorkflowGuide,
  type WorkspaceToolOptions,
} from "./workspaces.js";

export { createToolHandlers } from "./workflow-handlers.js";
import { createToolHandlers } from "./workflow-handlers.js";
/** Register all Hyperstar workflow tools on an MCP server. */
export function registerHyperstarTools(
  server: ToolRegistrar,
  client: HyperstarClient,
  options: WorkspaceToolOptions = {},
): void {
  const handlers = createToolHandlers(client, options);
  server.registerTool(
    "hyperstar_whoami",
    {
      ...toolMetadata("hyperstar_whoami"),
      inputSchema: WhoamiInputSchema,
    },
    async () => toolResult(await handlers.hyperstarWhoami()),
  );
  if (options.surface !== "hosted") {
    server.registerTool(
      "list_workspaces",
      {
        ...toolMetadata("list_workspaces"),
        inputSchema: ListWorkspacesInputSchema,
      },
      async (input) => toolResult(await handlers.listWorkspaces(input)),
    );
    server.registerTool(
      "select_workspace",
      {
        ...toolMetadata("select_workspace"),
        inputSchema: SelectWorkspaceInputSchema,
      },
      async (input) => toolResult(await handlers.selectWorkspace(input)),
    );
  }
  server.registerTool(
    "get_hyperstar_workflow_guide",
    {
      ...toolMetadata("get_hyperstar_workflow_guide"),
      inputSchema: WorkflowGuideInputSchema,
    },
    async (input) =>
      toolResult(await handlers.getHyperstarWorkflowGuide(input)),
  );
  server.registerTool(
    "search_creators",
    {
      ...toolMetadata("search_creators"),
      inputSchema: SearchCreatorsInputSchema,
    },
    async (input) => toolResult(await handlers.searchCreators(input)),
  );
  server.registerTool(
    "get_search_results",
    {
      ...toolMetadata("get_search_results"),
      inputSchema: GetSearchResultsInputSchema,
    },
    async (input) => toolResult(await handlers.getSearchResults(input)),
  );
  server.registerTool(
    "list_campaigns",
    {
      ...toolMetadata("list_campaigns"),
      inputSchema: ListCampaignsInputSchema,
    },
    async (input) => toolResult(await handlers.listCampaigns(input)),
  );
  server.registerTool(
    "create_campaign",
    {
      ...toolMetadata("create_campaign"),
      inputSchema: CreateCampaignInputSchema,
    },
    async (input) => toolResult(await handlers.createCampaign(input)),
  );
  server.registerTool(
    "save_search_results_to_campaign",
    {
      ...toolMetadata("save_search_results_to_campaign"),
      inputSchema: SaveSearchResultsToCampaignInputSchema,
    },
    async (input) =>
      toolResult(await handlers.saveSearchResultsToCampaign(input)),
  );
  server.registerTool(
    "list_campaign_creators",
    {
      ...toolMetadata("list_campaign_creators"),
      inputSchema: CampaignCreatorsInputSchema,
    },
    async (input) => toolResult(await handlers.listCampaignCreators(input)),
  );
  server.registerTool(
    "check_bulk_email_readiness",
    {
      ...toolMetadata("check_bulk_email_readiness"),
      inputSchema: CheckBulkEmailReadinessDiscoveryInputSchema,
    },
    async (input) =>
      toolResult(
        await handlers.checkBulkEmailReadiness(
          normalizeCheckBulkEmailReadinessInput(
            CheckBulkEmailReadinessDiscoveryInputSchema.parse(input),
          ),
        ),
      ),
  );
  server.registerTool(
    "start_email_unlock",
    {
      ...toolMetadata("start_email_unlock"),
      inputSchema: StartEmailUnlockInputSchema,
    },
    async (input) => toolResult(await handlers.startEmailUnlock(input)),
  );
  server.registerTool(
    "get_email_unlock_job",
    {
      ...toolMetadata("get_email_unlock_job"),
      inputSchema: EmailUnlockJobInputSchema,
    },
    async (input) => toolResult(await handlers.getEmailUnlockJob(input)),
  );
  server.registerTool(
    "start_bulk_email",
    {
      ...toolMetadata("start_bulk_email"),
      inputSchema: StartBulkEmailDiscoveryInputSchema,
    },
    async (input) =>
      toolResult(
        await handlers.startBulkEmail(
          normalizeStartBulkEmailInput(
            StartBulkEmailDiscoveryInputSchema.parse(input),
          ),
        ),
      ),
  );
  server.registerTool(
    "get_bulk_email_job",
    {
      ...toolMetadata("get_bulk_email_job"),
      inputSchema: BulkEmailJobInputSchema,
    },
    async (input) => toolResult(await handlers.getBulkEmailJob(input)),
  );
  registerInboxTools(server, handlers);
}
