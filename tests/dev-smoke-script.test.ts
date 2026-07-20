import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve("scripts/dev-smoke.mjs");

describe("dev smoke script", () => {
  it("requires a caller-provided internal fixture opt-in", async () => {
    const result = await runNodeScript(scriptPath, {
      HYPERSTAR_API_BASE_URL: "https://api.example.test",
      HYPERSTAR_APP_BASE_URL: "https://app.example.test",
      HYPERSTAR_MCP_SMOKE_CAMPAIGN_ID: "1",
      HYPERSTAR_MCP_SMOKE_CAMPAIGN_NAME: "Internal fixture",
      HYPERSTAR_MCP_SMOKE_RECIPIENT_ID: "2",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("HYPERSTAR_MCP_SMOKE_INTERNAL_FIXTURE=1");
  });
});

function runNodeScript(
  path: string,
  env: Record<string, string>,
): Promise<{ readonly code: number | null; readonly stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [path], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolveResult({ code, stderr });
    });
  });
}
