import { AsyncLocalStorage } from "node:async_hooks";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type ConnectorWorkspaceAccess = "single" | "all";

/** Tools that act on the grant itself rather than inside one workspace. */
const WORKSPACE_INDEPENDENT_TOOLS: ReadonlySet<string> = new Set([
  "list_workspaces",
  "get_hyperstar_workflow_guide",
]);

const WorkspaceIdSchema = z
  .uuid()
  .describe(
    "organization_id from list_workspaces for the workspace this call acts in. Use the workspace the user chose for this conversation; never switch without their instruction.",
  );

/** Carries the tool call's workspace to the Product API client for that call only. */
export type WorkspaceScope = {
  readonly access: ConnectorWorkspaceAccess;
  readonly current: () => string | undefined;
  readonly wrap: (
    register: McpServer["registerTool"],
  ) => McpServer["registerTool"];
};

/**
 * Wrap tool registration so an all-workspace grant names its workspace on every call.
 *
 * Workspace-scoped tools gain a required `workspace_id`, so a forgotten workspace fails
 * validation instead of silently acting in the grant's default workspace.
 * `hyperstar_whoami` takes it optionally to inspect a workspace. The id is removed before
 * the tool's own handler runs and travels only through this call's async context.
 */
export function createWorkspaceScope(
  access: ConnectorWorkspaceAccess,
): WorkspaceScope {
  const storage = new AsyncLocalStorage<string>();
  const wrap = (
    register: McpServer["registerTool"],
  ): McpServer["registerTool"] =>
    ((name, config, handler) => {
      if (access === "single" || WORKSPACE_INDEPENDENT_TOOLS.has(name))
        return register(name, config, handler);
      const inputSchema = config.inputSchema;
      if (!(inputSchema instanceof z.ZodObject))
        throw new Error(`Tool ${name} needs an object input schema`);
      const workspaceId =
        name === "hyperstar_whoami"
          ? WorkspaceIdSchema.optional()
          : WorkspaceIdSchema;
      const call = handler as (...args: unknown[]) => unknown;
      return register(
        name,
        // The registrar's generics cannot follow a schema rebuilt at runtime.
        {
          ...config,
          inputSchema: inputSchema.extend({ workspace_id: workspaceId }),
        } as unknown as typeof config,
        ((input: { workspace_id?: string }, ...rest: unknown[]) => {
          const { workspace_id, ...toolInput } = input;
          return workspace_id === undefined
            ? call(toolInput, ...rest)
            : storage.run(workspace_id, () => call(toolInput, ...rest));
        }) as typeof handler,
      );
    }) as McpServer["registerTool"];
  return { access, current: () => storage.getStore(), wrap };
}
