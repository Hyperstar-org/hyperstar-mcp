#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadServerConfig } from "./config.js";
import { createHyperstarMcpServer } from "./server.js";

const MCP_SERVER_USAGE = [
  "Usage: hyperstar-mcp [--help]",
  "",
  "Starts the Hyperstar stdio MCP server.",
  "",
  "Authentication:",
  "  Tools and guides are discoverable before auth.",
  "  Product API calls require HYPERSTAR_API_KEY (a service-account key).",
  "  To act as a signed-in user, connect to the hosted connector instead:",
  "  https://mcp.hyper-star.org/mcp",
].join("\n");

/** Start the stdio MCP server process. */
async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
    process.stdout.write(`${MCP_SERVER_USAGE}\n`);
    return;
  }
  const server = createHyperstarMcpServer(loadServerConfig());
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start Hyperstar MCP server: ${message}\n`);
  process.exitCode = 1;
});
