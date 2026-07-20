import type { ToolRegistrar } from "./tool-registrar.js";
import { toolMetadata } from "./tool-metadata.js";
import {
  GetInboxThreadMessagesInputSchema,
  InboxFiltersInputSchema,
  ListInboxThreadsInputSchema,
  SendInboxReplyInputSchema,
  UpdateInboxThreadStateInputSchema,
  type HyperstarToolHandlers,
} from "./tool-inputs.js";
import { toolResult } from "./tool-result.js";

/** Register inbox-focused Hyperstar MCP tools. */
export function registerInboxTools(
  server: ToolRegistrar,
  handlers: HyperstarToolHandlers,
): void {
  server.registerTool(
    "list_inbox_threads",
    {
      ...toolMetadata("list_inbox_threads"),
      inputSchema: ListInboxThreadsInputSchema,
    },
    async (input) => toolResult(await handlers.listInboxThreads(input)),
  );
  server.registerTool(
    "get_inbox_thread_messages",
    {
      ...toolMetadata("get_inbox_thread_messages"),
      inputSchema: GetInboxThreadMessagesInputSchema,
    },
    async (input) => toolResult(await handlers.getInboxThreadMessages(input)),
  );
  server.registerTool(
    "get_inbox_aggregates",
    {
      ...toolMetadata("get_inbox_aggregates"),
      inputSchema: InboxFiltersInputSchema,
    },
    async (input) => toolResult(await handlers.getInboxAggregates(input)),
  );
  server.registerTool(
    "update_inbox_thread_state",
    {
      ...toolMetadata("update_inbox_thread_state"),
      inputSchema: UpdateInboxThreadStateInputSchema,
    },
    async (input) => toolResult(await handlers.updateInboxThreadState(input)),
  );
  server.registerTool(
    "send_inbox_reply",
    {
      ...toolMetadata("send_inbox_reply"),
      inputSchema: SendInboxReplyInputSchema,
    },
    async (input) => toolResult(await handlers.sendInboxReply(input)),
  );
}
