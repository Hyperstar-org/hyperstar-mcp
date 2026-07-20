import { readFileSync } from "node:fs";

import { JsonObjectSchema } from "./schemas.js";

/** Read package metadata from the package root at runtime. */
export function packageVersion(): string {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const metadata = JsonObjectSchema.parse(JSON.parse(raw));
  const version = metadata.version;
  if (typeof version !== "string" || version.trim().length === 0) {
    throw new Error("package.json version is missing");
  }
  return version;
}
