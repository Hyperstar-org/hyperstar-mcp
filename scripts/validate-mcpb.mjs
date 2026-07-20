import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredBundleEntries = [
  { relativePath: "manifest.json", kind: "file" },
  { relativePath: "package.json", kind: "file" },
  { relativePath: "README.md", kind: "file" },
  { relativePath: "LICENSE", kind: "file" },
  { relativePath: "assets/icon.png", kind: "file" },
  { relativePath: "dist/index.js", kind: "file" },
  { relativePath: "node_modules", kind: "directory" },
];

/** Validate an MCPB artifact by unpacking and checking its bundle structure. */
export function validateMcpbArtifact(artifactArg, options = {}) {
  if (artifactArg === undefined) {
    throw new Error("Usage: node scripts/validate-mcpb.mjs <artifact.mcpb>");
  }

  const cwd = options.cwd ?? process.cwd();
  const runCommand = options.runCommand ?? run;
  const makeTempDir =
    options.makeTempDir ??
    (() => mkdtempSync(join(tmpdir(), "hyperstar-mcp-mcpb-validate-")));
  const artifactPath = resolve(cwd, artifactArg);
  if (!existsSync(artifactPath)) {
    throw new Error(`MCPB artifact does not exist: ${artifactPath}`);
  }
  if (extname(artifactPath) !== ".mcpb") {
    throw new Error(
      `MCPB artifact must have a .mcpb extension: ${artifactPath}`,
    );
  }

  const tempRoot = makeTempDir();
  const unpackRoot = join(tempRoot, "unpacked");
  try {
    runCommand("npm", ["exec", "--", "mcpb", "info", artifactPath], { cwd });
    runCommand(
      "npm",
      ["exec", "--", "mcpb", "unpack", artifactPath, unpackRoot],
      { cwd },
    );
    runCommand(
      "npm",
      ["exec", "--", "mcpb", "validate", join(unpackRoot, "manifest.json")],
      { cwd },
    );
    assertBundleStructure(unpackRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

/** Execute a validator subcommand with inherited output. */
function run(command, args, options) {
  execFileSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
  });
}

/** Assert that unpacked MCPB contents contain the files Claude needs to run. */
function assertBundleStructure(unpackRoot) {
  for (const entry of requiredBundleEntries) {
    const entryPath = join(unpackRoot, entry.relativePath);
    if (!existsSync(entryPath)) {
      throw new Error(`MCPB artifact is missing ${entry.relativePath}`);
    }

    const entryStats = statSync(entryPath);
    if (entry.kind === "file" && !entryStats.isFile()) {
      throw new Error(
        `MCPB artifact entry must be a file: ${entry.relativePath}`,
      );
    }
    if (entry.kind === "directory" && !entryStats.isDirectory()) {
      throw new Error(
        `MCPB artifact entry must be a directory: ${entry.relativePath}`,
      );
    }
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  validateMcpbArtifact(process.argv[2]);
}
