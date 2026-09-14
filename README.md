# @hyperstar/mcp

`@hyperstar/mcp` is the local stdio MCP server for Hyperstar headless
workflows. It exposes scoped creator search, campaign roster, bulk email, and
inbox tools for MCP clients using either a service-account key or local browser
CLI login.

This README is self-contained for first-time agent setup. You do not need
access to the Hyperstar source repository to install the package, configure an
MCP client, or understand the safe workflow order.

Public source and release assets:

```text
https://github.com/Hyperstar-org/hyperstar-mcp
https://github.com/Hyperstar-org/hyperstar-mcp/releases/tag/v0.2.0
```

## Hosted connector

Connect to `https://mcp.hyper-star.org/mcp` using OAuth. Sign in to your Hyperstar account,
select one workspace and approve the displayed permissions. The hosted connector requires
no local Node.js installation or API key.

[Add to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Hyperstar&connectorUrl=https%3A%2F%2Fmcp.hyper-star.org%2Fmcp)

- **Claude:** use the prefilled link above, or add the URL in Settings → Connectors.
- **ChatGPT:** enable developer mode if your account/workspace permits it, create a custom
  MCP connection with this URL and OAuth, then sign in. Add Hyperstar to a new conversation
  from its tools menu. See [OpenAI's current setup guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- **Claude Code:** run `claude mcp add --transport http hyperstar https://mcp.hyper-star.org/mcp`,
  then use `/mcp` in Claude Code to authenticate.
- **Codex:** run `codex mcp add hyperstar --url https://mcp.hyper-star.org/mcp` and complete
  browser sign-in. Use `codex mcp login hyperstar` to reconnect.

Start with `hyperstar_whoami` and `get_hyperstar_workflow_guide`. The workspace is bound
at consent; disconnect in Hyperstar Settings → MCP and reconnect to
switch workspaces. Disconnect stops future access, while requests already running and
queued emails may finish. The connector can send real emails: review recipients and
message content before authorizing a send.

The app's `/mcp` page is [setup guidance](https://app.hyper-star.org/mcp). The transport is
on the separate `mcp.hyper-star.org` host.

## Local package requirements

- Node.js `22.12.0` or newer.
- An active Hyperstar account with access to at least one workspace.
- Either a service-account API key or permission to approve local browser CLI
  login.
- An MCP-capable client that can launch a local stdio server.

## Claude Desktop Extension

Claude Desktop users should download and install the production Desktop
Extension:

```text
https://app.hyper-star.org/mcp/hyperstar-mcp-0.2.0.mcpb
```

The extension still runs Hyperstar MCP as a local stdio server; it is not a
remote HTTP endpoint.

For local builds from this package source, run `npm run build:mcpb` and
`npm run validate:mcpb`, then install `build/mcpb/hyperstar-mcp-0.2.0.mcpb`.

If you have a service-account API key from Team -> API keys, paste it into the
extension settings as `HYPERSTAR_API_KEY`. Service-account mode is the simplest
Claude Desktop setup because the key is already scoped to one workspace.

If you do not have an API key, ask Claude to use the Hyperstar MCP auth tools:

1. Call `start_browser_login`.
2. Open the returned authorization URL in your browser.
3. After approving access, have Claude call `complete_browser_login`.
4. Have Claude call `list_workspaces`, then `select_workspace`.

The npm setup below remains available for Claude Code, Codex-style agents, and
other MCP clients that install local stdio servers from a command.

## Claude Code Quickstart

For local stdio use, install the npm package and point Claude Code at the
`hyperstar-mcp` binary. For hosted OAuth, use the setup above.

macOS, Linux, and WSL:

```sh
claude mcp add hyperstar -- npx -y --package @hyperstar/mcp hyperstar-mcp
```

Windows PowerShell or Command Prompt:

```powershell
claude mcp add hyperstar -- npx.cmd -y --package @hyperstar/mcp hyperstar-mcp
```

Then restart Claude Code or open a new session so the `hyperstar_*` tools are
loaded. If Claude asks for connection details, use:

- package: `@hyperstar/mcp`
- transport: `stdio`
- command on macOS/Linux/WSL: `npx`
- command on Windows: `npx.cmd`
- args: `-y --package @hyperstar/mcp hyperstar-mcp`

For browser login, an agent on the same machine may run:

```sh
npx -y --package @hyperstar/mcp hyperstar login --no-open
```

The agent should show the printed URL to the user, keep the command running,
then list workspaces and select exactly one after login completes.

## Install And Login

Run the MCP server directly from npm:

```sh
npx -y --package @hyperstar/mcp hyperstar-mcp
```

The package exposes two binaries:

- `hyperstar-mcp`: the stdio MCP server.
- `hyperstar`: the local login and workspace helper CLI.

Because the package exposes multiple binaries, use the explicit
`--package @hyperstar/mcp hyperstar-mcp` form instead of bare
`npx -y @hyperstar/mcp` in MCP client configs.

If a client spawns through an environment that loses npm's temporary `.bin`
path, use the equivalent `npm exec` form:

```sh
npm exec --yes --package @hyperstar/mcp -- hyperstar-mcp
```

For interactive local use, start with browser login. An agent with shell access
on the same machine may run this command for the user. The CLI opens Hyperstar
in the browser and never asks for a raw Hyperstar password in the terminal:

```sh
npx -y --package @hyperstar/mcp hyperstar login
npx -y --package @hyperstar/mcp hyperstar workspaces list --json
npx -y --package @hyperstar/mcp hyperstar workspaces use <organization_id>
```

If the agent should not open the browser automatically, use `--no-open`. The
agent can show the printed URL to the user and keep the command running while
the browser completes the loopback callback:

```sh
npx -y --package @hyperstar/mcp hyperstar login --no-open
```

`hyperstar logout` revokes and clears the CLI token, but it does not sign out of
the browser session at `app.hyper-star.org`. To switch accounts, sign out in the
browser first or open the printed authorization URL in a private browser window.
After login, list workspaces and select exactly one before using workflow tools.

For unattended automation, create a service-account key from Team -> API keys in
the dashboard. Use the headless workflow preset. Enable inbox write only for
agents that are allowed to send inbox replies.

## MCP client config

Service-account auth is the simplest non-interactive setup. For production,
configure only the service-account API key and use the package's default
Hyperstar Product API base URL:

```json
{
  "mcpServers": {
    "hyperstar": {
      "command": "npx",
      "args": ["-y", "--package", "@hyperstar/mcp", "hyperstar-mcp"],
      "env": {
        "HYPERSTAR_API_KEY": "hstar_test_public-prefix.secret"
      }
    }
  }
}
```

Create API keys in the dashboard from Team -> API keys. Use the headless
workflow preset. Enable inbox write only for agents that are allowed to send
inbox replies.

When `HYPERSTAR_API_KEY` is omitted, the server falls back to the local browser
login state created by the `hyperstar` CLI:

```json
{
  "mcpServers": {
    "hyperstar": {
      "command": "npx",
      "args": ["-y", "--package", "@hyperstar/mcp", "hyperstar-mcp"]
    }
  }
}
```

Local browser login stores tokens under the OS config directory and the selected
workspace in the same auth state file. Run `hyperstar login`, then either select
a workspace with `hyperstar workspaces use <organization_id>` or use the MCP
`list_workspaces` and `select_workspace` tools. Service-account mode is already
workspace-scoped, so `get_hyperstar_workflow_guide` omits `select_workspace`
when `HYPERSTAR_API_KEY` is used. For non-production login, set matching
`HYPERSTAR_API_BASE_URL` and `HYPERSTAR_APP_BASE_URL` explicitly.
`HYPERSTAR_API_KEY` takes precedence over local CLI auth when both are present.

## Tools

Agents should start by reading `get_hyperstar_workflow_guide` or the MCP
resources/prompts listed below. The MCP server starts without auth so clients
can discover tools and guides first; Product API workflow calls still require
local browser login or `HYPERSTAR_API_KEY`. Tool responses include
`agent_guidance` and, where the next step is deterministic, `next_tool` and
`next_arguments`.

- `hyperstar_whoami`
- `start_browser_login`
- `complete_browser_login`
- `list_workspaces`
- `select_workspace`
- `get_hyperstar_workflow_guide`
- `search_creators`
- `get_search_results`
- `list_campaigns`
- `create_campaign`
- `save_search_results_to_campaign`
- `list_campaign_creators`
- `start_email_unlock`
- `get_email_unlock_job`
- `check_bulk_email_readiness`
- `start_bulk_email`
- `get_bulk_email_job`
- `list_inbox_threads`
- `get_inbox_thread_messages`
- `get_inbox_aggregates`
- `update_inbox_thread_state`
- `send_inbox_reply`

## Resources and prompts

The server exposes static workflow guides as MCP resources:

- `hyperstar://guide/headless-workflow`
- `hyperstar://guide/search-to-campaign`
- `hyperstar://guide/bulk-email-safety`
- `hyperstar://guide/inbox`

It also exposes matching prompts:

- `hyperstar_headless_workflow`
- `hyperstar_search_to_campaign`
- `hyperstar_bulk_email_safety`
- `hyperstar_inbox_workflow`

## First Agent Prompts

Use prompts like these with a newly connected agent:

```text
Use the Hyperstar MCP tools. First, discover the available Hyperstar workflow
guides and tell me the safe order for search, campaign save, bulk email, and
inbox handling.
```

```text
Use Hyperstar to search TikTok creators in the US for ceramic mug reviewers.
Return only a compact summary and explain the next tool I should approve before
saving anything to a campaign.
```

```text
List my Hyperstar campaigns and explain how you would safely check bulk email
readiness for one campaign without starting a real send.
```

```text
List recent Hyperstar inbox threads, then read the full messages for one thread
before drafting any reply. Do not send a reply unless I explicitly authorize it.
```

## Workflow Safety

Agents should start with `get_hyperstar_workflow_guide` or the MCP guide
resources. The server exposes these main workflow tools:

- `search_creators`
- `get_search_results`
- `list_campaigns`
- `create_campaign`
- `save_search_results_to_campaign`
- `list_campaign_creators`
- `start_email_unlock`
- `get_email_unlock_job`
- `check_bulk_email_readiness`
- `start_bulk_email`
- `get_bulk_email_job`
- `list_inbox_threads`
- `get_inbox_thread_messages`
- `update_inbox_thread_state`
- `send_inbox_reply`

`start_bulk_email` and `send_inbox_reply` perform real sends. Both require
`send_confirmation: "user_authorized"` and a stable `idempotency_key`. Agents
should call readiness and full-thread read tools before asking for send
authorization.

Search result tools return compact creator summaries by default. Bulk campaign
import uses `search_id` server-side, so the agent does not need to paste an
entire creator list into its context window.

## Privacy Policy

Hosted connector: Hyperstar processes the selected workspace's account identity, creator
search results, campaign data, email recipients/content and inbox data needed for requested
tools. Tool results are shared with the agent provider you connect; that provider's privacy
and retention terms also apply. Hyperstar stores the app identity, workspace permissions,
grant timestamps and hashed refresh credentials to operate and revoke the connection.
A short-lived encrypted token pair supports safe concurrent refresh. Authorization secrets
are separate from browser login credentials. Operational request logs support security and
reliability. Disconnecting revokes future access but does not delete workspace records,
queued work or copies already held by the agent provider. Workspace data follows Hyperstar's
privacy and retention policy; requests for access or deletion use the contact below.

Full Hyperstar privacy terms are published at
https://app.hyper-star.org/privacy.

Data collection: Hyperstar MCP reads and writes only the Hyperstar account,
workspace, campaign, creator-search, bulk-email, and inbox data that the
authenticated user or service account can access. Browser login stores local
CLI auth state on the user's machine; service-account keys are supplied by the
user or MCP client configuration.

Usage and storage: Workflow data is processed by Hyperstar Product API services
to perform the requested creator-search, campaign, email, and inbox actions.
The local MCP server does not run a separate telemetry service and does not ask
for raw Hyperstar passwords in the terminal.

Third-party sharing: The MCP package sends workflow requests to Hyperstar-owned
API origins. Email sends, inbox replies, and related delivery events may be
processed by Hyperstar's configured infrastructure providers as part of the
requested product workflow.

Data retention: Hyperstar account, workspace, campaign, search, email, and
inbox records follow Hyperstar's product retention policies. Local CLI auth
state remains on the user's machine until the user runs `hyperstar logout` or
removes the MCP client configuration.

Contact information: For privacy, security, or support questions, contact
support@hyper-star.org.

## Examples

Search creators:

```json
{
  "tool": "search_creators",
  "arguments": {
    "kind": "semantic",
    "platform": "tiktok",
    "region": "US",
    "query": "ceramic mug reviewers",
    "limit": 25
  }
}
```

YouTube creator discovery uses keyword retrieval and stable channel IDs:

```json
{
  "tool": "search_creators",
  "arguments": {
    "kind": "keyword",
    "platform": "youtube",
    "region": "US",
    "query": "home coffee equipment reviews",
    "filters": {
      "follower_range": { "min": 1000, "max": 100000 },
      "has_email": true
    },
    "limit": 25
  }
}
```

Common search filters are supplied as a structured JSON object. Useful fields
include `follower_range` as `{ "min": 1000, "max": 100000 }`,
`avg_engagement_rate`, `avg_views`, `has_email`, `email_contactability`,
`is_verified`, `has_tiktok_shop`, `creator_gender`, `creator_language`,
`category_1`, Instagram `category_name`, `gmv`, and `gpm`; `gmv` and `gpm` are
TikTok-only. Put broad niches and countries in `query` / `region` unless a
named structured filter applies. Use `sort_by` for `relevance`,
`follower_count`, `engagement_rate`, `avg_views`, `views_growth_rate`, `gmv`, or
`gpm`.

YouTube supports `follower_range`, `creator_language`, and `has_email` only;
reference/product search and metric sorting are unavailable.

Search tools return compact creator summaries by default so agents do not load
full profile payloads into context. Use `get_search_results` with
`detail_level: "full"` only when a page of raw creator rows is explicitly
needed. Bulk actions such as `save_search_results_to_campaign` use `search_id`
server-side and do not require the agent to materialize every creator. The
search response includes `agent_guidance` and `next_tools` so an unfamiliar
agent can continue without knowing the UI flow.

List or create a campaign before saving creators:

```json
{
  "tool": "list_campaigns",
  "arguments": {
    "limit": 25,
    "offset": 0
  }
}
```

```json
{
  "tool": "create_campaign",
  "arguments": {
    "name": "Summer creator outreach",
    "brand": "Hyperstar",
    "description": "Agent-created campaign for outreach testing"
  }
}
```

Save search results to a campaign roster:

```json
{
  "tool": "save_search_results_to_campaign",
  "arguments": {
    "campaign_id": 123,
    "search_id": "550e8400-e29b-41d4-a716-446655440000",
    "limit": 100
  }
}
```

Unlock eligible real catalog addresses before checking readiness. This action
requires an explicit cost cap and confirmation; `has_business_email` is never
treated as an address:

```json
{
  "tool": "start_email_unlock",
  "arguments": {
    "campaign_id": 123,
    "recipient_target": {
      "type": "selection",
      "campaign_creator_selection": {
        "workflow_filter": "email_not_sent",
        "platform": "youtube"
      }
    },
    "maximum_chargeable_unlocks": 25,
    "confirm_cost": true,
    "idempotency_key": "campaign-123-youtube-unlock-1"
  }
}
```

Check recipient readiness before any bulk send:

```json
{
  "tool": "check_bulk_email_readiness",
  "arguments": {
    "campaign_id": 123,
    "recipient_target": {
      "type": "ids",
      "campaign_creator_ids": [7, 8]
    }
  }
}
```

For filtered campaign roster sends, use `recipient_target.type: "selection"`
and pass `campaign_creator_selection`. The selection must include at least one
narrowing filter such as `workflow_filter: "email_not_sent"`, `platform`,
`source_type`, `search`, or `has_video`; empty selections,
`workflow_filter: "all"` by itself, and exclusions-only selections are
rejected.

Start a bulk email job. This performs a real send. The response includes the
queued job fields plus `next_tool: "get_bulk_email_job"` and `next_arguments`
so agents know how to check progress. Only call this after readiness has passed
and the user has authorized the send:

```json
{
  "tool": "start_bulk_email",
  "arguments": {
    "campaign_id": 123,
    "subject": "Partnership idea",
    "body_text": "Hi, we would like to introduce our new campaign.",
    "recipient_target": {
      "type": "ids",
      "campaign_creator_ids": [7, 8]
    },
    "idempotency_key": "campaign-123-intro-2026-07-09",
    "send_confirmation": "user_authorized"
  }
}
```

Read a full inbox thread before replying:

```json
{
  "tool": "get_inbox_thread_messages",
  "arguments": {
    "platform": "youtube",
    "thread_id": 456
  }
}
```

Reply to an inbox thread. This performs a real send. Only call this after the
user has authorized the reply and the agent has reviewed the full message
history:

```json
{
  "tool": "send_inbox_reply",
  "arguments": {
    "platform": "tiktok",
    "thread_id": 456,
    "subject": "Re: Partnership idea",
    "body_text": "Thanks for the reply. Here are the next details.",
    "idempotency_key": "thread-456-reply-2026-07-09",
    "send_confirmation": "user_authorized"
  }
}
```

## Clean-Room Smoke Check

Without a repository checkout, verify npm can resolve the package and both
binaries can start:

```bash
npm view @hyperstar/mcp version --silent
npm exec --yes --package @hyperstar/mcp -- hyperstar --help
npm exec --yes --package @hyperstar/mcp -- hyperstar-mcp --help
```

These checks do not authenticate and do not call Hyperstar workflow APIs. They
prove that npm can resolve the package and both binaries can start. The package
smoke script also verifies unauthenticated MCP `tools/list`, `resources/list`,
and `prompts/list` discovery.

## Troubleshooting

- `npm error could not determine executable to run`: use the explicit
  `--package @hyperstar/mcp -- hyperstar` or
  `--package @hyperstar/mcp -- hyperstar-mcp` form because the package exposes
  multiple binaries.
- `No Hyperstar auth configured`: run `hyperstar login` and select a workspace,
  or set `HYPERSTAR_API_KEY` in the MCP server environment.
- The agent says login must be run manually: the agent can run
  `hyperstar login --no-open`, show the printed URL, and wait while the user
  completes browser authentication on the same machine.
- Login keeps returning the same account: `hyperstar logout` clears only the CLI
  token. Sign out of `app.hyper-star.org` in the browser or use a private window
  for the authorization URL.
- Workspace errors in browser-login mode: run
  `hyperstar workspaces list --json`, then
  `hyperstar workspaces use <organization_id>`.
- Non-production login opens the wrong app: set both `HYPERSTAR_API_BASE_URL`
  and `HYPERSTAR_APP_BASE_URL`.

## Development

```sh
npm install
npm test
npm run build
npm run smoke:npm
```

`npm run smoke:npm` verifies the published npm package can be resolved and that
both package binaries print help without requiring local build artifacts,
authentication, or real workflow API calls.

## Expanded workflows (0.2.0)

The source includes campaign settings and roster edits, fixed selection copy/removal,
windowed performance and revenue, follow-up wave controls, creator lookup, forms,
and authenticated file uploads/downloads. CSV/XLSX creator imports support direct
uploads and browser handoffs, with durable progress, quota settlement and result CSVs.
Workspace usage and capacity checks include bounded unlock estimates without spending
credits. Use the task-specific MCP resources for campaign management, reporting,
forms/files or imports/usage instead of loading every guide.

Old grants keep their permissions; reconnect or explicitly add the new performance,
form and `usage:read` permissions to an API key when needed. Follow-up email remains
dev-only until provider threading verification is complete.
