import { z } from "zod";

import {
  createBrowserLoginManager,
  type BrowserLoginCompleteResult,
  type BrowserLoginManagerDependencies,
  type BrowserLoginStartResult,
} from "./auth/browser-login.js";
import { createFileCliAuthStateStore } from "./auth/cli-auth-state.js";
import type { HyperstarMcpConfig } from "./config.js";
import type { JsonObject } from "./http.js";
import type { ToolRegistrar } from "./tool-registrar.js";
import { toolMetadata } from "./tool-metadata.js";
import { toolResult } from "./tool-result.js";

const StartBrowserLoginInputSchema = z
  .object({
    no_open: z.boolean().optional(),
  })
  .strict();

const CompleteBrowserLoginInputSchema = z
  .object({
    login_id: z.string().trim().min(1),
  })
  .strict();

type EffectiveAuthConfig = {
  readonly authMode: HyperstarMcpConfig["authMode"];
};

export type AuthToolDependencies = Omit<
  BrowserLoginManagerDependencies,
  "store"
> & {
  readonly store?: BrowserLoginManagerDependencies["store"] | undefined;
  readonly getEffectiveConfig?:
    (() => EffectiveAuthConfig | Promise<EffectiveAuthConfig>) | undefined;
};

/** Register local browser-login helper tools before Product API workflow tools. */
export function registerHyperstarAuthTools(
  server: ToolRegistrar,
  dependencies: AuthToolDependencies = {},
): void {
  const { getEffectiveConfig, ...managerDependencies } = dependencies;
  const manager = createBrowserLoginManager({
    ...managerDependencies,
    store:
      dependencies.store ??
      createFileCliAuthStateStore(
        dependencies.env === undefined ? {} : { env: dependencies.env },
      ),
  });

  server.registerTool(
    "start_browser_login",
    {
      ...toolMetadata("start_browser_login"),
      inputSchema: StartBrowserLoginInputSchema,
    },
    async (input) => {
      const parsedInput = StartBrowserLoginInputSchema.parse(input);
      const serviceAccountActive =
        await serviceAccountActiveJson(getEffectiveConfig);
      if (serviceAccountActive !== undefined) {
        return toolResult(serviceAccountActive);
      }
      return toolResult(
        browserLoginStartJson(
          await manager.startLogin(startInput(parsedInput)),
        ),
      );
    },
  );
  server.registerTool(
    "complete_browser_login",
    {
      ...toolMetadata("complete_browser_login"),
      inputSchema: CompleteBrowserLoginInputSchema,
    },
    async (input) => {
      const parsedInput = CompleteBrowserLoginInputSchema.parse(input);
      const serviceAccountActive =
        await serviceAccountActiveJson(getEffectiveConfig);
      if (serviceAccountActive !== undefined) {
        return toolResult(serviceAccountActive);
      }
      return toolResult(
        browserLoginCompleteJson(
          await manager.completeLogin({ loginId: parsedInput.login_id }),
          parsedInput.login_id,
        ),
      );
    },
  );
}

/** Build a browser-login input without explicit undefined optional fields. */
function startInput(
  parsedInput: z.infer<typeof StartBrowserLoginInputSchema>,
): { readonly noOpen?: boolean } {
  return parsedInput.no_open === undefined
    ? {}
    : { noOpen: parsedInput.no_open };
}

/** Return a clear browser-login refusal when service-account auth is active. */
async function serviceAccountActiveJson(
  getEffectiveConfig: AuthToolDependencies["getEffectiveConfig"],
): Promise<JsonObject | undefined> {
  const effectiveConfig = await getEffectiveConfig?.();
  if (effectiveConfig?.authMode !== "service_account") {
    return undefined;
  }
  return {
    status: "service_account_active",
    auth_mode: "service_account",
    next_tool: "list_workspaces",
    next_arguments: {},
    agent_guidance:
      "Service-account API-key auth is active for this MCP server. Browser login is disabled for this session; call list_workspaces next, or remove HYPERSTAR_API_KEY before using local browser CLI auth.",
  };
}

/** Convert browser-login start metadata to MCP snake_case JSON. */
function browserLoginStartJson(result: BrowserLoginStartResult): JsonObject {
  return {
    status: result.status,
    login_id: result.loginId,
    authorize_url: result.authorizeUrl,
    callback_url: result.callbackUrl,
    next_tool: result.nextTool,
    next_arguments: { login_id: result.loginId },
    agent_guidance:
      "Open authorize_url in a browser, finish Hyperstar login, then call complete_browser_login with login_id.",
  };
}

/** Convert browser-login completion states to MCP snake_case JSON. */
function browserLoginCompleteJson(
  result: BrowserLoginCompleteResult,
  loginId: string,
): JsonObject {
  switch (result.status) {
    case "authorization_pending":
      return {
        status: result.status,
        next_tool: result.nextTool,
        next_arguments: { login_id: loginId },
        agent_guidance:
          "Authorization is still pending. Ask the user to finish the browser login, then call complete_browser_login again with login_id.",
      };
    case "authenticated":
      return {
        status: result.status,
        next_tool: result.nextTool,
        next_arguments: {},
        agent_guidance:
          "Hyperstar login is complete. Call list_workspaces next in this same MCP session.",
      };
    case "failed":
      return {
        status: result.status,
        error: result.error,
        next_tool: "start_browser_login",
        next_arguments: {},
        agent_guidance:
          "Browser login failed. Start a new browser login if the user wants to try again.",
      };
    case "not_found":
      return {
        status: result.status,
        next_tool: "start_browser_login",
        next_arguments: {},
        agent_guidance:
          "No active browser login was found for login_id. Start a new browser login.",
      };
  }
}
