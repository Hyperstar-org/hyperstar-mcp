import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig, loadServerConfig, redactSecret } from "../src/config.js";

describe("loadConfig", () => {
  it("requires an API key", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        XDG_CONFIG_HOME: `/tmp/hyperstar-mcp-no-auth-${process.pid}-${Date.now()}`,
      }),
    ).toThrow("Run `hyperstar login` or set HYPERSTAR_API_KEY");
  });

  it("allows MCP server discovery startup without configured auth", () => {
    const config = loadServerConfig({
      HYPERSTAR_API_BASE_URL: "https://api.example.test",
      XDG_CONFIG_HOME: `/tmp/hyperstar-mcp-no-auth-${process.pid}-${Date.now()}`,
    });

    expect(config).toEqual({
      authMode: "unauthenticated",
      apiBaseUrl: "https://api.example.test",
    });
  });

  it("defaults the API base URL when env base URL is omitted", () => {
    const config = loadConfig({
      HYPERSTAR_API_KEY: "hstar_test_public.secret",
    });

    expect(config.apiBaseUrl).toBe("https://autopilot.hyper-star.org");
    expect(config.authMode).toBe("service_account");
  });

  it("normalizes the API base URL without trailing slashes", () => {
    const config = loadConfig({
      HYPERSTAR_API_BASE_URL: "https://api.example.test///",
      HYPERSTAR_API_KEY: "hstar_test_public.secret",
    });

    expect(config.apiBaseUrl).toBe("https://api.example.test");
    expect(config).toMatchObject({
      authMode: "service_account",
      apiKey: "hstar_test_public.secret",
    });
  });

  it("keeps service-account config scoped to API key auth", () => {
    const config = loadConfig({
      HYPERSTAR_API_KEY: "hstar_test_public.secret",
      HYPERSTAR_APP_BASE_URL: "not needed in service-account mode",
    });

    expect(config).toEqual({
      authMode: "service_account",
      apiBaseUrl: "https://autopilot.hyper-star.org",
      apiKey: "hstar_test_public.secret",
    });
  });

  it("rejects API keys that cannot be safely sent as one header value", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret\nsecond-line",
      }),
    ).toThrow("HYPERSTAR_API_KEY contains unsupported characters");
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret\twith-tab",
      }),
    ).toThrow("HYPERSTAR_API_KEY contains unsupported characters");
  });

  it("rejects invalid API base URLs", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "not a url",
        HYPERSTAR_API_KEY: "hstar_test_public.secret",
      }),
    ).toThrow("HYPERSTAR_API_BASE_URL must be a valid URL");
  });

  it("rejects API base URLs with embedded credentials", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "https://user:secret@api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret",
      }),
    ).toThrow("HYPERSTAR_API_BASE_URL must not include credentials");
  });

  it("rejects non-HTTPS non-localhost API base URLs", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "http://api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret",
      }),
    ).toThrow(
      "HYPERSTAR_API_BASE_URL must use HTTPS, except localhost development URLs",
    );
  });

  it("allows localhost HTTP API base URLs", () => {
    const config = loadConfig({
      HYPERSTAR_API_BASE_URL: "http://localhost:8000///",
      HYPERSTAR_API_KEY: "hstar_test_public.secret",
    });

    expect(config.apiBaseUrl).toBe("http://localhost:8000");
  });

  it("rejects CLI auth state when env overrides it to a different API origin", () => {
    const root = mkdtempSync(join(tmpdir(), "hyperstar-mcp-config-test-"));
    try {
      writeAuthState(root, {
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
      });

      expect(() =>
        loadConfig({
          XDG_CONFIG_HOME: root,
          HYPERSTAR_API_BASE_URL: "https://attacker.example.test",
        }),
      ).toThrow(
        "Run `hyperstar login` again before changing HYPERSTAR_API_BASE_URL",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("treats a blank app base URL env value as omitted for persisted CLI auth", () => {
    const root = mkdtempSync(join(tmpdir(), "hyperstar-mcp-config-test-"));
    try {
      writeAuthState(root, {
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
      });

      const config = loadConfig({
        XDG_CONFIG_HOME: root,
        HYPERSTAR_APP_BASE_URL: "",
      });

      expect(config).toMatchObject({
        authMode: "cli",
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists a selected workspace when only access-token material rotated after verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "hyperstar-mcp-config-test-"));
    try {
      writeAuthState(root, {
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
      });
      const config = loadConfig({
        XDG_CONFIG_HOME: root,
      });
      if (config.authMode !== "cli") {
        throw new Error("expected CLI auth config");
      }
      const fingerprint =
        await config.workspaceSelection.getAuthStateFingerprint?.();
      const stateAfterFingerprint = loadConfig({ XDG_CONFIG_HOME: root });
      if (
        stateAfterFingerprint.authMode !== "cli" ||
        (await stateAfterFingerprint.workspaceSelection.getAuthStateFingerprint?.()) !==
          fingerprint
      ) {
        throw new Error("expected stable CLI auth fingerprint");
      }
      const persistedSessionId = readAuthSessionId(root);
      writeAuthState(root, {
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        authSessionId: persistedSessionId,
        refreshToken: "other-refresh-token",
        accessToken: "other-access-token",
        accessTokenExpiresAt: "2026-07-09T02:00:00.000Z",
      });

      await config.workspaceSelection.setSelectedOrganizationId("org_456", {
        expectedAuthStateFingerprint: fingerprint,
      });
      const reloaded = loadConfig({ XDG_CONFIG_HOME: root });
      if (reloaded.authMode !== "cli") {
        throw new Error("expected CLI auth config");
      }
      await expect(
        reloaded.workspaceSelection.getSelectedOrganizationId(),
      ).resolves.toBe("org_456");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to persist a selected workspace when auth principal changed after verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "hyperstar-mcp-config-test-"));
    try {
      writeAuthState(root, {
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
      });
      const config = loadConfig({
        XDG_CONFIG_HOME: root,
      });
      if (config.authMode !== "cli") {
        throw new Error("expected CLI auth config");
      }
      const fingerprint =
        await config.workspaceSelection.getAuthStateFingerprint?.();
      writeAuthState(root, {
        apiBaseUrl: "https://api.example.test",
        appBaseUrl: "https://app.example.test",
        authSessionId: "other-auth-session",
        refreshToken: "other-refresh-token",
        accessToken: "other-access-token",
      });

      await expect(
        config.workspaceSelection.setSelectedOrganizationId("org_456", {
          expectedAuthStateFingerprint: fingerprint,
        }),
      ).rejects.toThrow(
        "Hyperstar auth changed while selecting the workspace; run list_workspaces again",
      );
      const reloaded = loadConfig({ XDG_CONFIG_HOME: root });
      if (reloaded.authMode !== "cli") {
        throw new Error("expected CLI auth config");
      }
      await expect(
        reloaded.workspaceSelection.getSelectedOrganizationId(),
      ).resolves.toBe("org_123");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("redactSecret", () => {
  it("never echoes the full API key", () => {
    expect(redactSecret("hstar_test_public.secret")).toBe(
      "hstar_test_public.[redacted]",
    );
  });

  it("does not echo keys without a public prefix separator", () => {
    expect(redactSecret("opaque-secret-value")).toBe("[redacted]");
  });
});

function writeAuthState(
  root: string,
  overrides: {
    readonly apiBaseUrl: string;
    readonly appBaseUrl: string;
    readonly authSessionId?: string;
    readonly refreshToken?: string;
    readonly accessToken?: string;
    readonly accessTokenExpiresAt?: string;
  },
): void {
  const directory = join(root, "hyperstar");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "auth.json"),
    `${JSON.stringify(
      {
        apiBaseUrl: overrides.apiBaseUrl,
        appBaseUrl: overrides.appBaseUrl,
        ...(overrides.authSessionId === undefined
          ? {}
          : { authSessionId: overrides.authSessionId }),
        refreshToken: overrides.refreshToken ?? "refresh-token",
        accessToken: overrides.accessToken ?? "access-token",
        accessTokenExpiresAt:
          overrides.accessTokenExpiresAt ?? "2026-07-09T01:00:00.000Z",
        selectedOrganizationId: "org_123",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function readAuthSessionId(root: string): string {
  const parsed = JSON.parse(
    readFileSync(join(root, "hyperstar", "auth.json"), "utf8"),
  ) as { readonly authSessionId?: unknown };
  if (typeof parsed.authSessionId !== "string") {
    throw new Error("expected authSessionId");
  }
  return parsed.authSessionId;
}
