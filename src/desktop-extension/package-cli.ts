import { join, resolve } from "node:path";

import { stageDesktopExtensionBundle } from "./package.js";

/** Stage the desktop extension bundle from command-line arguments. */
async function main(): Promise<void> {
  const [buildRootArg, nodeModulesRootArg] = process.argv.slice(2);
  if (buildRootArg === undefined || nodeModulesRootArg === undefined) {
    throw new Error(
      "Usage: node dist/desktop-extension/package-cli.js <build-root> <node-modules-root>",
    );
  }

  const buildRoot = resolve(buildRootArg);
  const result = await stageDesktopExtensionBundle({
    packageRoot: process.cwd(),
    outputRoot: join(buildRoot, "hyperstar-mcp"),
    nodeModulesRoot: resolve(nodeModulesRootArg),
  });
  console.log(result.stagedRoot);
}

await main();
