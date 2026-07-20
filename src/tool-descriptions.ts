export const TOOL_DESCRIPTIONS = {
  startBrowserLogin:
    "Start local browser login for user-scoped Hyperstar auth when no service-account API key is configured. Open the returned authorize_url, then call complete_browser_login.",
  completeBrowserLogin:
    "Poll a browser-login attempt by login_id and continue to list_workspaces after authentication succeeds.",
  hyperstarWhoami:
    "Inspect the authenticated Hyperstar principal, workspace, scopes, and capabilities before running workflow tools.",
  listWorkspaces:
    "List Hyperstar workspaces available to the current auth session. In local browser CLI auth, call select_workspace next when a workspace is not selected.",
  selectWorkspace:
    "Persist the Hyperstar workspace selected for CLI-authenticated tools. Call hyperstar_whoami next to confirm scope.",
  workflowGuide:
    "Return the recommended Hyperstar workflow sequence, discovery resources, and send-safety notes.",
  searchCreators:
    "Create a creator search and return the first page as compact creator summaries. Filters use structured keys such as follower_range, avg_engagement_rate, avg_views, has_email, email_contactability, creator_language, category_1, category_name, gmv, and gpm. Put broad niches in query unless a platform-specific category field applies. Use search_id with save_search_results_to_campaign; request detail_level full only when raw rows are needed.",
  getSearchResults:
    "Page through an existing creator search. Defaults to compact creator summaries; use detail_level full only for raw detail-on-demand pages.",
  listCampaigns:
    "List campaigns in the authenticated workspace so agents can choose a campaign_id before saving search results.",
  createCampaign:
    "Create a campaign in the authenticated workspace. Use the returned campaign id with save_search_results_to_campaign.",
  saveSearchResultsToCampaign:
    "Save selected or top-ranked creator search results to a campaign roster server-side using search_id.",
  listCampaignCreators:
    "List creators saved on a campaign roster. Call check_bulk_email_readiness before any bulk-email send.",
  checkBulkEmailReadiness:
    "The final dry-run gate before bulk email. Requires recipient_target with exact IDs or a narrowed selection, checks those selected recipients, and returns sendability guidance.",
  startBulkEmail:
    'REAL SEND: start a campaign bulk-email job after readiness has passed and the user authorized sending. Requires recipient_target, an explicit idempotency key, and send_confirmation: "user_authorized".',
  getBulkEmailJob:
    "Read campaign bulk-email job status after start_bulk_email returns a job_id.",
  listInboxThreads:
    "List Hyperstar inbox thread summaries with filters for triage. Call get_inbox_thread_messages before drafting replies.",
  getInboxThreadMessages:
    "Read full message history for one Hyperstar inbox thread before deciding whether to reply.",
  getInboxAggregates:
    "Read aggregate counts for Hyperstar inbox filters to summarize inbox state.",
  updateInboxThreadState:
    "Archive, snooze, star, or set read state for one inbox thread without sending a message.",
  sendInboxReply:
    'REAL SEND: send one user-authorized reply to a Hyperstar inbox thread with an explicit idempotency key and send_confirmation: "user_authorized".',
} as const;
