import { HYPERSTAR_TOOL_ORDER, toolMetadata } from "../tool-metadata.js";

type DesktopExtensionToolDeclaration = {
  readonly name: string;
  readonly description: string;
};

type DesktopExtensionUserConfigEntry = {
  readonly type: "string";
  readonly title: string;
  readonly description: string;
  readonly required: false;
  readonly default: string;
  readonly sensitive?: true;
};

type DesktopExtensionManifest = {
  readonly manifest_version: "0.3";
  readonly name: "hyperstar-mcp";
  readonly display_name: "Hyperstar MCP";
  readonly version: string;
  readonly description: string;
  readonly author: {
    readonly name: "Hyperstar";
  };
  readonly homepage: "https://app.hyper-star.org";
  readonly documentation: "https://app.hyper-star.org/mcp";
  readonly support: "mailto:support@hyper-star.org";
  readonly privacy_policies: readonly ["https://app.hyper-star.org/privacy"];
  readonly icon: "assets/icon.png";
  readonly server: {
    readonly type: "node";
    readonly entry_point: "dist/index.js";
    readonly mcp_config: {
      readonly command: "node";
      readonly args: readonly ["${__dirname}/dist/index.js"];
      readonly env: {
        readonly HYPERSTAR_API_KEY: "${user_config.HYPERSTAR_API_KEY}";
        readonly HYPERSTAR_API_BASE_URL: "${user_config.HYPERSTAR_API_BASE_URL}";
        readonly HYPERSTAR_APP_BASE_URL: "${user_config.HYPERSTAR_APP_BASE_URL}";
      };
    };
  };
  readonly tools: readonly DesktopExtensionToolDeclaration[];
  readonly tools_generated: true;
  readonly user_config: {
    readonly HYPERSTAR_API_KEY: DesktopExtensionUserConfigEntry & {
      readonly sensitive: true;
    };
    readonly HYPERSTAR_API_BASE_URL: DesktopExtensionUserConfigEntry;
    readonly HYPERSTAR_APP_BASE_URL: DesktopExtensionUserConfigEntry;
  };
};

type DesktopExtensionManifestMetadata = {
  readonly version: string;
  readonly description: string;
};

/** Claude Desktop Extension tool declarations for generated MCPB metadata. */
export const desktopExtensionToolDeclarations = HYPERSTAR_TOOL_ORDER.map(
  (name) => ({
    name,
    description: toolMetadata(name).description,
  }),
) satisfies readonly DesktopExtensionToolDeclaration[];

/** Build the Hyperstar Claude Desktop Extension manifest. */
export function buildDesktopExtensionManifest(
  metadata: DesktopExtensionManifestMetadata,
): DesktopExtensionManifest {
  return {
    manifest_version: "0.3",
    name: "hyperstar-mcp",
    display_name: "Hyperstar MCP",
    version: metadata.version,
    description: metadata.description,
    author: {
      name: "Hyperstar",
    },
    homepage: "https://app.hyper-star.org",
    documentation: "https://app.hyper-star.org/mcp",
    support: "mailto:support@hyper-star.org",
    privacy_policies: ["https://app.hyper-star.org/privacy"],
    icon: "assets/icon.png",
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
    tools: desktopExtensionToolDeclarations,
    tools_generated: true,
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
  };
}
