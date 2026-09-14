import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type PackageJson = {
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly license?: string;
  readonly repository?: {
    readonly type?: string;
    readonly url?: string;
    readonly directory?: string;
  };
  readonly main?: string;
  readonly types?: string;
  readonly exports?: {
    readonly ".": { readonly import: string; readonly types: string };
  };
  readonly bin?: Record<string, string>;
  readonly files?: readonly string[];
  readonly scripts?: Record<string, string>;
};

describe("package metadata", () => {
  it("keeps package imports side-effect-free while bins start executables", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;

    expect(packageJson.main).toBe("dist/server.js");
    expect(packageJson.types).toBe("dist/server.d.ts");
    expect(packageJson.exports?.["."]).toEqual({
      import: "./dist/server.js",
      types: "./dist/server.d.ts",
    });
    expect(packageJson.bin).toMatchObject({
      "hyperstar-mcp": "dist/index.js",
      hyperstar: "dist/cli.js",
    });
  });

  it("includes the standalone smoke entrypoint in the published package", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;
    expect(packageJson.files).toContain("scripts/npm-clean-room-smoke.mjs");
    expect(packageJson.scripts?.["smoke:npm"]).toBe(
      "node scripts/npm-clean-room-smoke.mjs",
    );
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "git+https://github.com/Hyperstar-org/hyperstar-mcp.git",
    });
    expect(
      existsSync(
        new URL("../scripts/npm-clean-room-smoke.mjs", import.meta.url),
      ),
    ).toBe(true);
  });

  it("keeps npm search metadata aligned with beginner MCP discovery", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;

    expect(packageJson.description).toContain("Claude Code");
    expect(packageJson.keywords).toEqual(
      expect.arrayContaining([
        "hyperstar",
        "hyperstarai",
        "hyper-star",
        "claude-code",
        "claude-desktop",
        "stdio",
      ]),
    );
  });

  it("uses explicit proprietary package licensing metadata", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;
    const license = readFileSync(
      new URL("../LICENSE", import.meta.url),
      "utf8",
    );

    expect(packageJson.license).toBe("SEE LICENSE IN LICENSE");
    expect(packageJson.files).toContain("LICENSE");
    expect(license).toContain("Proprietary License");
    expect(license).toContain("All rights reserved");
  });

  it("runs npm smoke commands outside the local package directory", () => {
    const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
    const temp = mkdtempSync(join(tmpdir(), "hyperstar-mcp-npm-smoke-test-"));
    try {
      const fakeNpm = join(temp, "npm");
      writeFileSync(
        fakeNpm,
        [
          "#!/usr/bin/env node",
          "if (process.cwd() === process.env.FORBIDDEN_CWD) {",
          "  console.error(`forbidden cwd: ${process.cwd()}`);",
          "  process.exit(42);",
          "}",
          "const args = process.argv.slice(2);",
          "if (args[0] === 'view') {",
          "  console.log('0.0.0-test');",
          "} else if (args.includes('hyperstar')) {",
          "  console.log('Usage: hyperstar <command> [options]');",
          "} else if (args.includes('hyperstar-mcp') && args.includes('--help')) {",
          "  console.log('ok');",
          "} else if (args.includes('hyperstar-mcp')) {",
          "  process.stdin.setEncoding('utf8');",
          "  process.stdin.on('data', chunk => {",
          "    for (const line of chunk.trim().split('\\n').filter(Boolean)) {",
          "      const request = JSON.parse(line);",
          "      if (request.method === 'initialize') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0.0.0' } } }));",
          "      } else if (request.method === 'tools/list') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'search_creators' }] } }));",
          "      } else if (request.method === 'resources/list') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resources: [{ uri: 'hyperstar://guide/headless-workflow' }] } }));",
          "      } else if (request.method === 'prompts/list') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { prompts: [{ name: 'hyperstar_headless_workflow' }] } }));",
          "      }",
          "    }",
          "  });",
          "} else {",
          "  console.error(`unexpected args: ${args.join(' ')}`);",
          "  process.exit(2);",
          "}",
        ].join("\n"),
      );
      chmodSync(fakeNpm, 0o755);

      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../scripts/npm-clean-room-smoke.mjs", import.meta.url),
          ),
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            FORBIDDEN_CWD: root,
            HYPERSTAR_MCP_NPM_PACKAGE: "@hyperstar/mcp@0.0.0-test",
            PATH: `${temp}${delimiter}${process.env.PATH ?? ""}`,
          },
        },
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"step": "registry-version"');
      expect(result.stdout).toContain('"step": "hyperstar-cli-help"');
      expect(result.stdout).toContain('"step": "hyperstar-mcp-help"');
      expect(result.stdout).toContain('"step": "hyperstar-mcp-discovery"');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("allows npm smoke checks against a local tarball package spec", () => {
    const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
    const temp = mkdtempSync(
      join(tmpdir(), "hyperstar-mcp-tarball-smoke-test-"),
    );
    try {
      const fakeNpm = join(temp, "npm");
      writeFileSync(
        fakeNpm,
        [
          "#!/usr/bin/env node",
          "const args = process.argv.slice(2);",
          "if (args[0] === 'view') {",
          "  console.error('npm view must not run for local tarballs');",
          "  process.exit(43);",
          "} else if (args.includes('hyperstar')) {",
          "  console.log('Usage: hyperstar <command> [options]');",
          "} else if (args.includes('hyperstar-mcp') && args.includes('--help')) {",
          "  console.log('ok');",
          "} else if (args.includes('hyperstar-mcp')) {",
          "  process.stdin.setEncoding('utf8');",
          "  process.stdin.on('data', chunk => {",
          "    for (const line of chunk.trim().split('\\n').filter(Boolean)) {",
          "      const request = JSON.parse(line);",
          "      if (request.method === 'initialize') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0.0.0' } } }));",
          "      } else if (request.method === 'tools/list') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'search_creators' }] } }));",
          "      } else if (request.method === 'resources/list') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resources: [{ uri: 'hyperstar://guide/headless-workflow' }] } }));",
          "      } else if (request.method === 'prompts/list') {",
          "        console.log(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { prompts: [{ name: 'hyperstar_headless_workflow' }] } }));",
          "      }",
          "    }",
          "  });",
          "} else {",
          "  console.error(`unexpected args: ${args.join(' ')}`);",
          "  process.exit(2);",
          "}",
        ].join("\n"),
      );
      chmodSync(fakeNpm, 0o755);

      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../scripts/npm-clean-room-smoke.mjs", import.meta.url),
          ),
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            HYPERSTAR_MCP_NPM_PACKAGE: join(temp, "hyperstar-mcp-test.tgz"),
            PATH: `${temp}${delimiter}${process.env.PATH ?? ""}`,
          },
        },
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"step": "local-package"');
      expect(result.stdout).toContain('"step": "hyperstar-cli-help"');
      expect(result.stdout).toContain('"step": "hyperstar-mcp-help"');
      expect(result.stdout).toContain('"step": "hyperstar-mcp-discovery"');
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("prints MCP server help from a clean published-package install without auth", () => {
    const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
    const temp = mkdtempSync(join(tmpdir(), "hyperstar-mcp-clean-help-test-"));
    const pack = spawnSync("npm", ["pack", "--silent"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(pack.stderr).toBe("");
    expect(pack.status).toBe(0);
    const tarballName = pack.stdout.trim().split("\n").at(-1);
    expect(tarballName).toMatch(/^hyperstar-mcp-.+\.tgz$/);
    const tarballPath = resolve(root, tarballName as string);
    try {
      const result = spawnSync(
        "npm",
        [
          "exec",
          "--yes",
          "--package",
          tarballPath,
          "--",
          "hyperstar-mcp",
          "--help",
        ],
        {
          cwd: temp,
          encoding: "utf8",
          env: {
            ...process.env,
            XDG_CONFIG_HOME: join(temp, "config"),
            npm_config_cache: join(temp, "npm-cache"),
            npm_config_update_notifier: "false",
          },
        },
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: hyperstar-mcp");
    } finally {
      rmSync(tarballPath, { force: true });
      rmSync(temp, { recursive: true, force: true });
    }
  }, 20_000);
});
