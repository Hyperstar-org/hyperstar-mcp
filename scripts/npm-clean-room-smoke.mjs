#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
);
const packageSpec =
  process.env.HYPERSTAR_MCP_NPM_PACKAGE ??
  `${packageJson.name}@${packageJson.version}`;
const scratchDir = mkdtempSync(resolve(tmpdir(), "hyperstar-mcp-npm-smoke-"));

function isLocalPackageSpec(value) {
  return (
    value.startsWith("file:") ||
    value.startsWith(".") ||
    value.endsWith(".tgz") ||
    isAbsolute(value)
  );
}

function logLocalPackageSpec(value) {
  console.log(
    JSON.stringify(
      {
        step: "local-package",
        ok: true,
        command: [],
        stdout: [value],
      },
      null,
      2,
    ),
  );
}

function smokeEnv() {
  const env = {
    ...process.env,
    HOME: scratchDir,
    XDG_CONFIG_HOME: resolve(scratchDir, "config"),
    npm_config_cache: resolve(scratchDir, "npm-cache"),
    npm_config_update_notifier: "false",
  };
  delete env.HYPERSTAR_API_KEY;
  delete env.HYPERSTAR_API_BASE_URL;
  delete env.HYPERSTAR_APP_BASE_URL;
  return env;
}

function runStep(step, command, args) {
  const result = spawnSync(command, args, {
    cwd: scratchDir,
    encoding: "utf8",
    env: smokeEnv(),
    shell: false,
  });
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.status !== 0) {
    console.error(
      JSON.stringify(
        {
          step,
          ok: false,
          command: [command, ...args],
          status: result.status,
          stdout,
          stderr,
        },
        null,
        2,
      ),
    );
    process.exit(result.status ?? 1);
  }
  console.log(
    JSON.stringify(
      {
        step,
        ok: true,
        command: [command, ...args],
        stdout: stdout.split("\n").slice(0, 8),
      },
      null,
      2,
    ),
  );
}

async function runMcpDiscoveryStep() {
  const child = spawn(
    "npm",
    ["exec", "--yes", "--package", packageSpec, "--", "hyperstar-mcp"],
    {
      cwd: scratchDir,
      env: smokeEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const responses = [];
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    for (;;) {
      const lineEnd = stdout.indexOf("\n");
      if (lineEnd === -1) {
        break;
      }
      const line = stdout.slice(0, lineEnd).trim();
      stdout = stdout.slice(lineEnd + 1);
      if (line.length === 0) {
        continue;
      }
      responses.push(JSON.parse(line));
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const waitFor = (id) =>
    new Promise((resolveResponse, rejectResponse) => {
      const started = Date.now();
      const interval = setInterval(() => {
        const response = responses.find((item) => item.id === id);
        if (response !== undefined) {
          clearInterval(interval);
          resolveResponse(response);
          return;
        }
        if (Date.now() - started > 15_000) {
          clearInterval(interval);
          rejectResponse(
            new Error(`Timed out waiting for MCP response ${id}: ${stderr}`),
          );
        }
      }, 50);
    });

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "hyperstar-npm-smoke", version: "0.0.0" },
      },
    });
    await waitFor(1);
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    send({ jsonrpc: "2.0", id: 3, method: "resources/list", params: {} });
    send({ jsonrpc: "2.0", id: 4, method: "prompts/list", params: {} });
    const [tools, resources, prompts] = await Promise.all([
      waitFor(2),
      waitFor(3),
      waitFor(4),
    ]);
    console.log(
      JSON.stringify(
        {
          step: "hyperstar-mcp-discovery",
          ok: true,
          tools: tools.result.tools.map((tool) => tool.name).slice(0, 8),
          resources: resources.result.resources.map((resource) => resource.uri),
          prompts: prompts.result.prompts.map((prompt) => prompt.name),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          step: "hyperstar-mcp-discovery",
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          stderr: stderr.trim(),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
}

try {
  if (isLocalPackageSpec(packageSpec)) {
    logLocalPackageSpec(packageSpec);
  } else {
    runStep("registry-version", "npm", [
      "view",
      packageSpec,
      "version",
      "--silent",
    ]);
  }
  runStep("hyperstar-cli-help", "npm", [
    "exec",
    "--yes",
    "--package",
    packageSpec,
    "--",
    "hyperstar",
    "--help",
  ]);
  runStep("hyperstar-mcp-help", "npm", [
    "exec",
    "--yes",
    "--package",
    packageSpec,
    "--",
    "hyperstar-mcp",
    "--help",
  ]);
  await runMcpDiscoveryStep();
} finally {
  rmSync(scratchDir, { recursive: true, force: true });
}
