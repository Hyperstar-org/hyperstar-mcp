import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const packageRoot = process.cwd();
const buildRoot = resolve(packageRoot, "build", "mcpb");
const prodInstallRoot = join(buildRoot, "prod-install");
const stagedRoot = join(buildRoot, "hyperstar-mcp");
const packageJsonPath = resolve(packageRoot, "package.json");
const packageLockPath = resolve(packageRoot, "package-lock.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || version.trim() === "") {
  throw new Error("package.json version is missing");
}

const artifactPath = join(buildRoot, `hyperstar-mcp-${version}.mcpb`);
const manifestPath = join(stagedRoot, "manifest.json");

rmSync(buildRoot, { recursive: true, force: true });
run("npm", ["run", "build"]);
mkdirSync(prodInstallRoot, { recursive: true });
cpSync(packageJsonPath, join(prodInstallRoot, "package.json"));
cpSync(packageLockPath, join(prodInstallRoot, "package-lock.json"));
run("npm", ["ci", "--omit=dev", "--ignore-scripts"], {
  cwd: prodInstallRoot,
});
run("node", [
  "dist/desktop-extension/package-cli.js",
  buildRoot,
  join(prodInstallRoot, "node_modules"),
]);
run("npm", ["exec", "--", "mcpb", "validate", manifestPath]);
run("npm", ["exec", "--", "mcpb", "pack", stagedRoot, artifactPath]);
run("node", ["scripts/validate-mcpb.mjs", artifactPath]);
console.log(artifactPath);

/** Run a command while inheriting stdio for build-script transparency. */
function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: packageRoot,
    stdio: "inherit",
    ...options,
  });
}
