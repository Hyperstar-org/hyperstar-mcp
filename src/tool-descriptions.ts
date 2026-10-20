export const TOOL_DESCRIPTIONS = {
  hyperstarWhoami:
    "Inspect the authenticated Hyperstar principal, workspace, scopes, and capabilities before running workflow tools.",
  listWorkspaces:
    "List Hyperstar workspaces available to the current credential. Hosted all-workspace grants pass one organization_id as workspace_id on later calls; an API key is already bound to one workspace.",
  workflowGuide:
    "Return the recommended Hyperstar workflow sequence, discovery resources, and send-safety notes.",
  searchCreators:
    "Create a creator search and return compact creator summaries. Use kind=keyword for YouTube, whose supported arguments are region and query and whose supported structured filters are follower_range, creator_language, and has_email; YouTube reference search and metric sorting are unavailable. TikTok/Instagram use semantic or reference search and their existing richer filters. A reference (lookalike) search needs its reference creator indexed first: check get_creator_catalog_status, and use request_creator_catalog_enrichment when it reports not_in_catalog; a 409 REFERENCE_CREATOR_NOT_INDEXED error means the same. Use search_id with save_search_results_to_campaign.",
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
  startEmailUnlock:
    "Create an idempotent campaign email-unlock job after explicit cost confirmation. Unlocks only real catalog email addresses, including eligible YouTube channel emails.",
  getEmailUnlockJob:
    "Read a durable campaign email-unlock job status before checking bulk-email readiness.",
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
