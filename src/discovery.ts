import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  buildWorkflowMarkdown,
  workflowGuideResourceDefinitions,
  type WorkflowGuideKind,
} from "./workflow-content.js";

type WorkflowPromptDefinition = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly kind: WorkflowGuideKind;
};

const workflowPromptDefinitions = [
  {
    name: "hyperstar_headless_workflow",
    title: "Hyperstar Headless Workflow",
    description:
      "Use Hyperstar search, campaign, bulk email, and inbox tools in the recommended order.",
    kind: "headless-workflow",
  },
  {
    name: "hyperstar_search_to_campaign",
    title: "Hyperstar Search To Campaign",
    description:
      "Search creators with compact results and save selected results to a campaign.",
    kind: "search-to-campaign",
  },
  {
    name: "hyperstar_bulk_email_safety",
    title: "Hyperstar Bulk Email Safety",
    description:
      "Check readiness and idempotency before a real bulk-email send.",
    kind: "bulk-email-safety",
  },
  {
    name: "hyperstar_inbox_workflow",
    title: "Hyperstar Inbox Workflow",
    description: "Read, triage, and reply to inbox threads safely.",
    kind: "inbox",
  },
] as const satisfies readonly WorkflowPromptDefinition[];

export type HyperstarDiscoveryOptions = {
  readonly apiBaseUrl: string;
};

/** Register static MCP resources and prompts that explain Hyperstar workflows. */
export function registerHyperstarDiscovery(
  server: McpServer,
  options: HyperstarDiscoveryOptions,
): void {
  void options;
  for (const resource of workflowGuideResourceDefinitions) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: "text/markdown",
      },
      (uri) => ({
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: buildWorkflowMarkdown(resource.kind),
          },
        ],
      }),
    );
  }

  for (const prompt of workflowPromptDefinitions) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
      },
      () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildWorkflowMarkdown(prompt.kind),
            },
          },
        ],
      }),
    );
  }
}
