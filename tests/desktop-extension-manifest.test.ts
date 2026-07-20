import { describe, expect, it } from "vitest";

import {
  buildDesktopExtensionManifest,
  desktopExtensionToolDeclarations,
} from "../src/desktop-extension/manifest.js";
import { createHyperstarMcpServer } from "../src/server.js";

const workflowToolNames = [
  "hyperstar_whoami",
  "list_workspaces",
  "select_workspace",
  "get_hyperstar_workflow_guide",
  "search_creators",
  "get_search_results",
  "list_campaigns",
  "create_campaign",
  "save_search_results_to_campaign",
  "list_campaign_creators",
  "check_bulk_email_readiness",
  "start_bulk_email",
  "get_bulk_email_job",
  "list_inbox_threads",
  "get_inbox_thread_messages",
  "get_inbox_aggregates",
  "update_inbox_thread_state",
  "send_inbox_reply",
] as const;

describe("buildDesktopExtensionManifest", () => {
  it("builds the Hyperstar MCPB manifest contract", () => {
    const manifest = buildDesktopExtensionManifest({
      version: "0.1.22",
      description: "Metadata-provided Hyperstar MCPB manifest description.",
    });

    expect(manifest).toMatchObject({
      manifest_version: "0.3",
      name: "hyperstar-mcp",
      display_name: "Hyperstar MCP",
      version: "0.1.22",
      description: "Metadata-provided Hyperstar MCPB manifest description.",
      author: {
        name: "Hyperstar",
      },
      icon: "assets/icon.png",
      homepage: "https://app.hyper-star.org",
      documentation: "https://app.hyper-star.org/mcp",
      support: "mailto:support@hyper-star.org",
      privacy_policies: ["https://app.hyper-star.org/privacy"],
      tools_generated: true,
      server: {
        type: "node",
        entry_point: "dist/index.js",
        mcp_config: {
          command: "node",
          args: ["${__dirname}/dist/index.js"],
          env: {
            HYPERSTAR_API_KEY: "${user_config.HYPERSTAR_API_KEY}",
            HYPERSTAR_API_BASE_URL: "${user_config.HYPERSTAR_API_BASE_URL}",
            HYPERSTAR_APP_BASE_URL: "${user_config.HYPERSTAR_APP_BASE_URL}",
          },
        },
      },
      user_config: {
        HYPERSTAR_API_KEY: {
          type: "string",
          title: "Hyperstar API Key",
          description: "Optional Hyperstar service-account API key.",
          required: false,
          default: "",
          sensitive: true,
        },
        HYPERSTAR_API_BASE_URL: {
          type: "string",
          title: "Hyperstar API Base URL",
          description: "Optional Product API base URL override.",
          required: false,
          default: "https://autopilot.hyper-star.org",
        },
        HYPERSTAR_APP_BASE_URL: {
          type: "string",
          title: "Hyperstar App Base URL",
          description: "Optional Hyperstar app base URL override.",
          required: false,
          default: "",
        },
      },
    });

    expect(
      Object.keys(manifest).filter((key) =>
        ["homepage", "documentation", "support", "privacy_policies"].includes(
          key,
        ),
      ),
    ).toEqual(["homepage", "documentation", "support", "privacy_policies"]);
    expect(manifest.tools).toEqual(desktopExtensionToolDeclarations);
    expect(desktopExtensionToolDeclarations.map((tool) => tool.name)).toEqual([
      "start_browser_login",
      "complete_browser_login",
      ...workflowToolNames,
    ]);
  });

  it("maps extension user config into env while declaring safe defaults", () => {
    const manifest = buildDesktopExtensionManifest({
      version: "0.1.22",
      description: "Metadata-provided Hyperstar MCPB manifest description.",
    });

    expect(manifest.server.mcp_config.env).toEqual({
      HYPERSTAR_API_KEY: "${user_config.HYPERSTAR_API_KEY}",
      HYPERSTAR_API_BASE_URL: "${user_config.HYPERSTAR_API_BASE_URL}",
      HYPERSTAR_APP_BASE_URL: "${user_config.HYPERSTAR_APP_BASE_URL}",
    });
    expect(manifest.user_config.HYPERSTAR_API_KEY.default).toBe("");
    expect(manifest.user_config.HYPERSTAR_API_BASE_URL.default).toBe(
      "https://autopilot.hyper-star.org",
    );
    expect(manifest.user_config.HYPERSTAR_APP_BASE_URL.default).toBe("");
    expect(resolveDefaultEnv(manifest)).toEqual({
      HYPERSTAR_API_KEY: "",
      HYPERSTAR_API_BASE_URL: "https://autopilot.hyper-star.org",
      HYPERSTAR_APP_BASE_URL: "",
    });
  });

  it("declares the same tool names that the MCP server registers", () => {
    const manifest = buildDesktopExtensionManifest({
      version: "0.1.22",
      description: "Metadata-provided Hyperstar MCPB manifest description.",
    });
    const server = createHyperstarMcpServer({
      authMode: "unauthenticated",
      apiBaseUrl: "https://api.example.test",
    });

    expect(manifest.tools.map((tool) => tool.name).toSorted()).toEqual(
      registeredToolNames(server).toSorted(),
    );
  });

  it("keeps MCPB tool declarations schema-valid while runtime tools expose directory-review annotations", () => {
    const manifest = buildDesktopExtensionManifest({
      version: "0.1.22",
      description: "Metadata-provided Hyperstar MCPB manifest description.",
    });
    const server = createHyperstarMcpServer({
      authMode: "unauthenticated",
      apiBaseUrl: "https://api.example.test",
    });

    for (const tool of manifest.tools) {
      expect(tool).toEqual({
        name: expect.any(String),
        description: expect.any(String),
      });
      expect(tool).not.toHaveProperty("title");
      expect(tool).not.toHaveProperty("annotations");
    }

    for (const tool of Object.values(registeredTools(server))) {
      expect(tool.title).toEqual(expect.any(String));
      expect(tool.annotations?.title).toBe(tool.title);
      expect(
        tool.annotations?.readOnlyHint === true ||
          typeof tool.annotations?.destructiveHint === "boolean",
      ).toBe(true);
    }

    expect(annotationByName(server, "start_bulk_email")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(annotationByName(server, "send_inbox_reply")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(annotationByName(server, "search_creators")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(
      annotationByName(server, "check_bulk_email_readiness"),
    ).toMatchObject({
      readOnlyHint: true,
    });

    expect(registeredToolNames(server).toSorted()).toEqual(
      manifest.tools.map((tool) => tool.name).toSorted(),
    );
  });
});

function resolveDefaultEnv(
  manifest: ReturnType<typeof buildDesktopExtensionManifest>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(manifest.server.mcp_config.env).map(([key, value]) => {
      const match = /^\$\{user_config\.([A-Z_]+)\}$/.exec(value);
      if (match === null) {
        return [key, value];
      }
      const configEntry =
        manifest.user_config[match[1] as keyof typeof manifest.user_config];
      return [key, configEntry.default];
    }),
  );
}

function registeredToolNames(
  server: ReturnType<typeof createHyperstarMcpServer>,
): string[] {
  return Object.keys(registeredTools(server));
}

function registeredTools(
  server: ReturnType<typeof createHyperstarMcpServer>,
): Record<
  string,
  {
    readonly title?: string;
    readonly annotations?: {
      readonly title?: string;
      readonly readOnlyHint?: boolean;
      readonly destructiveHint?: boolean;
    };
  }
> {
  const internals = server as unknown as {
    readonly _registeredTools: Record<
      string,
      {
        readonly title?: string;
        readonly annotations?: {
          readonly title?: string;
          readonly readOnlyHint?: boolean;
          readonly destructiveHint?: boolean;
        };
      }
    >;
  };
  return Object.fromEntries(
    Object.entries(internals._registeredTools).map(([name, tool]) => [
      name,
      {
        title: tool.title,
        annotations: tool.annotations,
      },
    ]),
  );
}

function annotationByName(
  server: ReturnType<typeof createHyperstarMcpServer>,
  name: string,
): {
  readonly title?: string;
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
} {
  const annotations = registeredTools(server)[name]?.annotations;
  expect(annotations).toBeDefined();
  return annotations ?? {};
}
