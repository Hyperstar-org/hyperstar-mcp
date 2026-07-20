export const CLI_USAGE = [
  "Usage: hyperstar <command> [options]",
  "",
  "Commands:",
  "  login [--no-open]             Open browser login and save local CLI auth",
  "  logout                        Revoke and clear local CLI auth",
  "  whoami [--json]               Print the authenticated principal",
  "  workspaces list [--json]      List accessible workspaces",
  "  workspaces use <workspace_id> Select a workspace for Product API calls",
  "",
  "Options:",
  "  --json     Print supported command output as JSON",
  "  --no-open  Print the login URL without opening a browser",
  "  --help     Show this help",
].join("\n");

export const BROWSER_SESSION_BOUNDARY =
  "Browser sessions are separate from CLI sessions; logout does not sign out of the browser account.";

export const BROWSER_ACCOUNT_SWITCH_GUIDANCE =
  "Browser sessions are separate from CLI sessions; sign out in the browser or use a private window to switch browser accounts.";

export const WORKSPACE_SELECTION_GUIDANCE =
  "Run `hyperstar workspaces list --json`, select exactly one workspace, then run `hyperstar workspaces use <organization_id>`.";
