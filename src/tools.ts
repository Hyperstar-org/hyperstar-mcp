import type { HyperstarClient, JsonObject } from "./http.js";
import { bulkEmailQueuedResult } from "./bulk-email-guidance.js";
import {
  readinessRequestBody,
  startBulkEmailRequestBody,
} from "./bulk-email-tool-body.js";
import { registerInboxTools } from "./inbox-tool-registration.js";
import { projectSearchResultPage } from "./search-result-projection.js";
import {
  campaignImportGuidance,
  campaignRosterGuidance,
  inboxThreadListGuidance,
  inboxThreadMessagesGuidance,
  readinessGuidance,
  searchGuidance,
} from "./tool-guidance.js";
import { toolResult } from "./tool-result.js";
import {
  compactJsonObject,
  pathSegment,
  queryFrom,
} from "./tool-http-helpers.js";
import { toolMetadata } from "./tool-metadata.js";
import {
  BulkEmailJobResponseSchema,
  BulkEmailReadinessResponseSchema,
  CampaignDetailResponseSchema,
  CampaignCreatorsResponseSchema,
  CampaignImportResponseSchema,
  CampaignsResponseSchema,
  InboxAggregatesResponseSchema,
  InboxThreadPageResponseSchema,
  InboxWorkspaceStateResponseSchema,
  JsonObjectSchema,
  SearchCreatedResponseSchema,
  SearchResultsResponseSchema,
  WhoamiResponseSchema,
} from "./schemas.js";
import {
  BulkEmailJobInputSchema,
  CampaignCreatorsInputSchema,
  CheckBulkEmailReadinessDiscoveryInputSchema,
  CheckBulkEmailReadinessInputSchema,
  CreateCampaignInputSchema,
  GetInboxThreadMessagesInputSchema,
  GetSearchResultsInputSchema,
  InboxFiltersInputSchema,
  ListInboxThreadsInputSchema,
  ListCampaignsInputSchema,
  ListWorkspacesInputSchema,
  SaveSearchResultsToCampaignInputSchema,
  SearchCreatorsInputSchema,
  SelectWorkspaceInputSchema,
  SendInboxReplyInputSchema,
  StartBulkEmailDiscoveryInputSchema,
  StartBulkEmailInputSchema,
  UpdateInboxThreadStateInputSchema,
  WorkflowGuideInputSchema,
  WhoamiInputSchema,
  normalizeCheckBulkEmailReadinessInput,
  normalizeStartBulkEmailInput,
  type HyperstarToolHandlers,
} from "./tool-inputs.js";
import type { ToolRegistrar } from "./tool-registrar.js";
import {
  getHyperstarWorkflowGuide,
  listAvailableWorkspaces,
  selectAvailableWorkspace,
  type WorkspaceToolOptions,
} from "./workspaces.js";

/** Build workflow handlers around a Hyperstar HTTP client. */
export function createToolHandlers(
  client: HyperstarClient,
  options: WorkspaceToolOptions = {},
): HyperstarToolHandlers {
  return {
    hyperstarWhoami: async () =>
      WhoamiResponseSchema.parse(await client.get("/v1/whoami")),

    listWorkspaces: async (input = {}) => {
      ListWorkspacesInputSchema.parse(input);
      return listAvailableWorkspaces(client, options);
    },

    selectWorkspace: async (input) => {
      const parsedInput = SelectWorkspaceInputSchema.parse(input);
      return selectAvailableWorkspace(
        client,
        parsedInput.organization_id,
        options,
      );
    },

    getHyperstarWorkflowGuide: async (input = {}) => {
      WorkflowGuideInputSchema.parse(input);
      return getHyperstarWorkflowGuide(options);
    },

    searchCreators: async (input) => {
      const parsedInput = SearchCreatorsInputSchema.parse(input);
      const body = compactJsonObject([
        ["kind", parsedInput.kind],
        ["platform", parsedInput.platform],
        ["region", parsedInput.region],
        ["query", parsedInput.query],
        ["filters", parsedInput.filters],
        ["limit", parsedInput.limit],
        ["reference", parsedInput.reference],
        ["sort_by", parsedInput.sort_by],
        ["sort_order", parsedInput.sort_order],
      ]);
      const created = SearchCreatedResponseSchema.parse(
        await client.post("/v1/searches", body),
      );
      const limit = Math.min(parsedInput.limit ?? 25, 100);
      const results = SearchResultsResponseSchema.parse(
        await client.get(
          `/v1/searches/${pathSegment(created.search_id)}/results`,
          queryFrom({ limit, offset: 0 }),
        ),
      );
      return {
        search_id: created.search_id,
        ...searchGuidance(
          projectSearchResultPage(
            results,
            parsedInput.detail_level ?? "summary",
            created.search_id,
            { deterministicNextPage: false },
          ),
        ),
      };
    },

    getSearchResults: async (input) => {
      const parsedInput = GetSearchResultsInputSchema.parse(input);
      const results = SearchResultsResponseSchema.parse(
        await client.get(
          `/v1/searches/${pathSegment(parsedInput.search_id)}/results`,
          queryFrom({
            limit: parsedInput.limit ?? 25,
            offset: parsedInput.offset ?? 0,
          }),
        ),
      );
      return projectSearchResultPage(
        results,
        parsedInput.detail_level ?? "summary",
        parsedInput.search_id,
      );
    },

    saveSearchResultsToCampaign: async (input) => {
      const parsedInput = SaveSearchResultsToCampaignInputSchema.parse(input);
      return campaignImportGuidance(
        CampaignImportResponseSchema.parse(
          await client.post(
            `/v1/campaigns/${pathSegment(parsedInput.campaign_id)}/creators:import`,
            {
              mode: "search_selection",
              search_id: parsedInput.search_id,
              limit: parsedInput.limit ?? 100,
              ...(parsedInput.excluded_origin_ids === undefined
                ? {}
                : { excluded_origin_ids: parsedInput.excluded_origin_ids }),
              ...(parsedInput.reference_id === undefined
                ? {}
                : { reference_id: parsedInput.reference_id }),
            },
          ),
        ),
        parsedInput.campaign_id,
      );
    },

    listCampaigns: async (input = {}) => {
      const parsedInput = ListCampaignsInputSchema.parse(input);
      return CampaignsResponseSchema.parse(
        await client.get(
          "/v1/campaigns",
          queryFrom({
            status: parsedInput.status,
            sync: parsedInput.sync,
            limit: parsedInput.limit ?? 50,
            offset: parsedInput.offset ?? 0,
          }),
        ),
      );
    },

    createCampaign: async (input) => {
      const parsedInput = CreateCampaignInputSchema.parse(input);
      return CampaignDetailResponseSchema.parse(
        await client.post(
          "/v1/campaigns",
          compactJsonObject([
            ["name", parsedInput.name],
            ["brand", parsedInput.brand],
            ["description", parsedInput.description],
            ["budget", parsedInput.budget],
            ["product_name", parsedInput.product_name],
            ["landing_page", parsedInput.landing_page],
            ["selling_points", parsedInput.selling_points],
            ["hashtags", parsedInput.hashtags],
            ["content_brief", parsedInput.content_brief],
            ["amazon_product_urls", parsedInput.amazon_product_urls],
          ]),
        ),
      );
    },

    listCampaignCreators: async (input) => {
      const parsedInput = CampaignCreatorsInputSchema.parse(input);
      return campaignRosterGuidance(
        CampaignCreatorsResponseSchema.parse(
          await client.get(
            `/v1/campaigns/${pathSegment(parsedInput.campaign_id)}/creators`,
            queryFrom({
              limit: parsedInput.limit ?? 50,
              offset: parsedInput.offset ?? 0,
            }),
          ),
        ),
        parsedInput.campaign_id,
      );
    },

    checkBulkEmailReadiness: async (input) => {
      const parsedInput = CheckBulkEmailReadinessInputSchema.parse(input);
      return readinessGuidance(
        BulkEmailReadinessResponseSchema.parse(
          await client.post(
            `/v1/campaigns/${pathSegment(parsedInput.campaign_id)}/bulk-email/readiness`,
            readinessRequestBody(parsedInput),
          ),
        ),
        parsedInput,
      );
    },

    startBulkEmail: async (input) => {
      const parsedInput = StartBulkEmailInputSchema.parse(input);
      return bulkEmailQueuedResult(
        BulkEmailJobResponseSchema.parse(
          await client.post(
            `/v1/campaigns/${pathSegment(parsedInput.campaign_id)}/bulk-email/jobs`,
            startBulkEmailRequestBody(parsedInput),
            { "Idempotency-Key": parsedInput.idempotency_key },
          ),
        ),
      );
    },

    getBulkEmailJob: async (input) => {
      const parsedInput = BulkEmailJobInputSchema.parse(input);
      return BulkEmailJobResponseSchema.parse(
        await client.get(
          `/v1/bulk-email/jobs/${pathSegment(parsedInput.job_id)}`,
        ),
      );
    },

    listInboxThreads: async (input) => {
      const parsedInput = ListInboxThreadsInputSchema.parse(input);
      return inboxThreadListGuidance(
        InboxThreadPageResponseSchema.parse(
          await client.get("/v1/inbox/threads", queryFrom(parsedInput)),
        ),
      );
    },

    getInboxAggregates: async (input) => {
      const parsedInput = InboxFiltersInputSchema.parse(input);
      return InboxAggregatesResponseSchema.parse(
        await client.get(
          "/v1/inbox/threads/aggregates",
          queryFrom(parsedInput),
        ),
      );
    },

    getInboxThreadMessages: async (input) => {
      const parsedInput = GetInboxThreadMessagesInputSchema.parse(input);
      return inboxThreadMessagesGuidance(
        JsonObjectSchema.parse(
          await client.get(
            `/v1/inbox/threads/${pathSegment(parsedInput.platform)}/${pathSegment(parsedInput.thread_id)}/messages`,
          ),
        ),
      );
    },

    updateInboxThreadState: async (input) => {
      const parsedInput = UpdateInboxThreadStateInputSchema.parse(input);
      return InboxWorkspaceStateResponseSchema.parse(
        await client.patch(
          `/v1/inbox/threads/${pathSegment(parsedInput.platform)}/${pathSegment(parsedInput.thread_id)}/state`,
          compactJsonObject([
            ["archived", parsedInput.archived],
            ["snoozed_until", parsedInput.snoozed_until],
            ["clear_snooze", parsedInput.clear_snooze],
            ["starred", parsedInput.starred],
            ["read_state", parsedInput.read_state],
            ["clear_read_state", parsedInput.clear_read_state],
          ]),
        ),
      );
    },

    sendInboxReply: async (input) => {
      const parsedInput = SendInboxReplyInputSchema.parse(input);
      return JsonObjectSchema.parse(
        await client.post(
          `/v1/inbox/threads/${pathSegment(parsedInput.platform)}/${pathSegment(parsedInput.thread_id)}/replies`,
          compactJsonObject([
            ["subject", parsedInput.subject],
            ["body_text", parsedInput.body_text],
            ["attachments", parsedInput.attachments],
            ["campaign_creator_id", parsedInput.campaign_creator_id],
            ["idempotency_key", parsedInput.idempotency_key],
            ["send_confirmation", parsedInput.send_confirmation],
          ]),
        ),
      );
    },
  };
}

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
