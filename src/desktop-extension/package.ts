import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { buildDesktopExtensionManifest } from "./manifest.js";

type JsonObject = {
  readonly [key: string]: unknown;
};

type DesktopExtensionPackageMetadata = JsonObject & {
  readonly version: string;
  readonly description: string;
};

export type StageDesktopExtensionBundleOptions = {
  readonly packageRoot: string;
  readonly outputRoot: string;
  readonly nodeModulesRoot: string;
};

export type StagedDesktopExtensionBundle = {
  readonly stagedRoot: string;
  readonly manifestPath: string;
};

/** Stage a Claude Desktop Extension bundle from built package artifacts. */
export async function stageDesktopExtensionBundle(
  options: StageDesktopExtensionBundleOptions,
): Promise<StagedDesktopExtensionBundle> {
  const packageRoot = resolve(options.packageRoot);
  const outputRoot = resolve(options.outputRoot);
  const nodeModulesRoot = resolve(options.nodeModulesRoot);
  assertSafeOutputRoot({ packageRoot, outputRoot, nodeModulesRoot });
  const metadata = await readPackageMetadata(packageRoot);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    cp(join(packageRoot, "dist"), join(outputRoot, "dist"), {
      recursive: true,
      filter: (source) =>
        relative(join(packageRoot, "dist"), source).split(/[\\/]/)[0] !==
        "hosted",
    }),
    cp(nodeModulesRoot, join(outputRoot, "node_modules"), {
      recursive: true,
    }),
    cp(join(packageRoot, "README.md"), join(outputRoot, "README.md")),
    cp(join(packageRoot, "LICENSE"), join(outputRoot, "LICENSE")),
    cp(join(packageRoot, "package.json"), join(outputRoot, "package.json")),
  ]);

  await mkdir(join(outputRoot, "assets"), { recursive: true });
  await cp(
    join(packageRoot, "assets", "icon.png"),
    join(outputRoot, "assets", "icon.png"),
  );

  const manifest = buildDesktopExtensionManifest(metadata);
  const manifestPath = join(outputRoot, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    stagedRoot: outputRoot,
    manifestPath,
  };
}

/** Reject staging roots that can delete source or dependency inputs. */
function assertSafeOutputRoot(options: {
  readonly packageRoot: string;
  readonly outputRoot: string;
  readonly nodeModulesRoot: string;
}): void {
  const { packageRoot, outputRoot, nodeModulesRoot } = options;
  if (isSameOrAncestor(outputRoot, packageRoot)) {
    throw new Error(
      `Unsafe desktop extension outputRoot: ${outputRoot} must not be the package root or one of its ancestors`,
    );
  }
  if (isSameOrAncestor(outputRoot, nodeModulesRoot)) {
    throw new Error(
      `Unsafe desktop extension outputRoot: ${outputRoot} must not be the node_modules root or one of its ancestors`,
    );
  }

  const canonicalPackageStagingRoot = join(
    packageRoot,
    "build",
    "mcpb",
    "hyperstar-mcp",
  );
  if (
    isSameOrDescendant(outputRoot, packageRoot) &&
    !isSameOrDescendant(outputRoot, canonicalPackageStagingRoot)
  ) {
    throw new Error(
      `Unsafe desktop extension outputRoot: ${outputRoot} must be under ${canonicalPackageStagingRoot}`,
    );
  }

  const tempRoot = resolve(tmpdir());
  if (
    !isSameOrDescendant(outputRoot, packageRoot) &&
    (!isSameOrDescendant(packageRoot, tempRoot) ||
      !isSameOrDescendant(outputRoot, tempRoot))
  ) {
    throw new Error(
      `Unsafe desktop extension outputRoot: ${outputRoot} must be under the package build directory`,
    );
  }
}

/** Return true when candidate is equal to target or an ancestor of target. */
function isSameOrAncestor(candidate: string, target: string): boolean {
  const pathFromCandidateToTarget = relative(candidate, target);
  return (
    pathFromCandidateToTarget === "" ||
    (!pathFromCandidateToTarget.startsWith("..") &&
      !isAbsolute(pathFromCandidateToTarget))
  );
}

/** Return true when candidate is equal to ancestor or below it. */
function isSameOrDescendant(candidate: string, ancestor: string): boolean {
  return isSameOrAncestor(ancestor, candidate);
}

/** Read the package metadata required by the MCPB manifest builder. */
async function readPackageMetadata(
  packageRoot: string,
): Promise<DesktopExtensionPackageMetadata> {
  const raw = await readFile(join(packageRoot, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error("package.json must contain a JSON object");
  }
  if (typeof parsed.version !== "string" || parsed.version.trim() === "") {
    throw new Error("package.json version is missing");
  }
  if (
    typeof parsed.description !== "string" ||
    parsed.description.trim() === ""
  ) {
    throw new Error("package.json description is missing");
  }
  return {
    ...parsed,
    version: parsed.version,
    description: parsed.description,
  };
}

/** Return true when a parsed JSON value is a plain object. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
