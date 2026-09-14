import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { stageDesktopExtensionBundle } from "../src/desktop-extension/package.js";

describe("stageDesktopExtensionBundle", () => {
  it("stages the MCPB bundle from built package files and production dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "hyperstar-mcp-stage-"));
    const packageRoot = join(root, "package");
    const outputRoot = join(root, "staged", "hyperstar-mcp");
    const nodeModulesRoot = join(root, "prod-install", "node_modules");

    await mkdir(join(packageRoot, "dist"), { recursive: true });
    await mkdir(join(packageRoot, "assets"), { recursive: true });
    await mkdir(join(nodeModulesRoot, "zod"), { recursive: true });

    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify(
        {
          name: "@hyperstar/mcp",
          version: "0.1.22",
          description: "Local stdio MCP server for Hyperstar.",
        },
        null,
        2,
      ),
    );
    await writeFile(join(packageRoot, "README.md"), "# Hyperstar MCP\n");
    await writeFile(join(packageRoot, "LICENSE"), "License text\n");
    await writeFile(join(packageRoot, "dist", "index.js"), "export {};\n");
    await writeFile(
      join(packageRoot, "assets", "icon.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    await writeFile(
      join(nodeModulesRoot, "zod", "package.json"),
      JSON.stringify({ name: "zod", version: "4.4.3" }),
    );

    const result = await stageDesktopExtensionBundle({
      packageRoot,
      outputRoot,
      nodeModulesRoot,
    });

    expect(result.stagedRoot).toBe(outputRoot);
    await expect(
      readFile(join(outputRoot, "dist", "index.js"), "utf8"),
    ).resolves.toBe("export {};\n");
    await expect(readFile(join(outputRoot, "README.md"), "utf8")).resolves.toBe(
      "# Hyperstar MCP\n",
    );
    await expect(readFile(join(outputRoot, "LICENSE"), "utf8")).resolves.toBe(
      "License text\n",
    );
    await expect(
      readFile(join(outputRoot, "node_modules", "zod", "package.json"), "utf8"),
    ).resolves.toContain('"name":"zod"');
    await expect(
      readFile(join(outputRoot, "assets", "icon.png")),
    ).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    const stagedPackageJson = JSON.parse(
      await readFile(join(outputRoot, "package.json"), "utf8"),
    ) as { version?: string };
    expect(stagedPackageJson.version).toBe("0.1.22");

    const manifest = JSON.parse(
      await readFile(join(outputRoot, "manifest.json"), "utf8"),
    ) as {
      version?: string;
      description?: string;
      server?: { entry_point?: string };
    };
    expect(manifest.version).toBe("0.1.22");
    expect(manifest.description).toBe("Local stdio MCP server for Hyperstar.");
    expect(manifest.server?.entry_point).toBe("dist/index.js");
  });

  it.each([
    ["package root", ({ packageRoot }) => packageRoot],
    ["package root ancestor", ({ root }) => root],
    ["node_modules root", ({ nodeModulesRoot }) => nodeModulesRoot],
    ["node_modules root ancestor", ({ root }) => join(root, "prod-install")],
  ] as const)(
    "rejects an unsafe output root at the %s before deletion",
    async (_label, selectOutputRoot) => {
      const context = await createPackageFixture();
      const sentinelPath = join(context.packageRoot, "dist", "index.js");

      await expect(
        stageDesktopExtensionBundle({
          packageRoot: context.packageRoot,
          outputRoot: selectOutputRoot(context),
          nodeModulesRoot: context.nodeModulesRoot,
        }),
      ).rejects.toThrow(/Unsafe desktop extension outputRoot/);

      expect(existsSync(sentinelPath)).toBe(true);
    },
  );

  it("allows the canonical package build staging directory", async () => {
    const context = await createPackageFixture();
    const outputRoot = join(
      context.packageRoot,
      "build",
      "mcpb",
      "hyperstar-mcp",
    );

    await expect(
      stageDesktopExtensionBundle({
        packageRoot: context.packageRoot,
        outputRoot,
        nodeModulesRoot: context.nodeModulesRoot,
      }),
    ).resolves.toMatchObject({ stagedRoot: outputRoot });
  });

  it("rejects external output roots for the real package build context", async () => {
    const projectRoot = fileURLToPath(new URL("..", import.meta.url));
    const outputRoot = await mkdtemp(
      join(tmpdir(), "hyperstar-mcp-external-output-"),
    );
    const sentinelPath = join(outputRoot, "sentinel.txt");
    await writeFile(sentinelPath, "do not delete\n");

    await expect(
      stageDesktopExtensionBundle({
        packageRoot: projectRoot,
        outputRoot,
        nodeModulesRoot: join(projectRoot, "node_modules"),
      }),
    ).rejects.toThrow(/Unsafe desktop extension outputRoot/);

    expect(existsSync(sentinelPath)).toBe(true);
  });
});

describe("validate-mcpb script", () => {
  it("rejects arbitrary .mcpb bytes with structural validation", async () => {
    const root = await mkdtemp(join(tmpdir(), "hyperstar-mcp-invalid-mcpb-"));
    const artifactPath = join(root, "invalid.mcpb");
    await writeFile(artifactPath, Buffer.from("not a real mcpb artifact"));

    const scriptPath = fileURLToPath(
      new URL("../scripts/validate-mcpb.mjs", import.meta.url),
    );
    const projectRoot = dirname(dirname(scriptPath));
    const result = spawnSync(process.execPath, [scriptPath, artifactPath], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /unpack|archive|invalid|MCPB|zip/i,
    );
  });
});

type PackageFixtureContext = {
  readonly root: string;
  readonly packageRoot: string;
  readonly nodeModulesRoot: string;
};

async function createPackageFixture(): Promise<PackageFixtureContext> {
  const root = await mkdtemp(join(tmpdir(), "hyperstar-mcp-stage-"));
  const packageRoot = join(root, "package");
  const nodeModulesRoot = join(root, "prod-install", "node_modules");

  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await mkdir(join(packageRoot, "assets"), { recursive: true });
  await mkdir(join(nodeModulesRoot, "zod"), { recursive: true });

  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify(
      {
        name: "@hyperstar/mcp",
        version: "0.1.22",
        description: "Local stdio MCP server for Hyperstar.",
      },
      null,
      2,
    ),
  );
  await writeFile(join(packageRoot, "README.md"), "# Hyperstar MCP\n");
  await writeFile(join(packageRoot, "LICENSE"), "License text\n");
  await writeFile(join(packageRoot, "dist", "index.js"), "export {};\n");
  await writeFile(
    join(packageRoot, "assets", "icon.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  await writeFile(
    join(nodeModulesRoot, "zod", "package.json"),
    JSON.stringify({ name: "zod", version: "4.4.3" }),
  );

  return { root, packageRoot, nodeModulesRoot };
}
