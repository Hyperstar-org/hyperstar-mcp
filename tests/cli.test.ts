import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createStoredCliAccessTokenProvider } from "../src/auth/cli-auth-client.js";
import {
  createFileCliAuthStateStore,
  type CliAuthStateStore,
} from "../src/auth/cli-auth-state.js";
import { isDirectCliInvocation, runCli } from "../src/cli.js";
import { createCliWorkspaceSelection } from "../src/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((path) => rm(path, { recursive: true })));
  tempDirs.length = 0;
});

describe("hyperstar CLI", () => {
  it("prints command help", async () => {
    const stdout: string[] = [];

    const exitCode = await runCli(["--help"], {
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("Usage: hyperstar");
    expect(stdout.join("\n")).toContain("login");
    expect(stdout.join("\n")).toContain("workspaces list");
  });

  it("prints command help when npm forwards the help flag as a positional", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["--", "--help"], {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("Usage: hyperstar");
    expect(stderr).toEqual([]);
  });

  it("recognizes npm bin symlink invocations as direct CLI execution", async () => {
    const root = await makeTempDir();
    const realEntrypoint = join(root, "dist", "cli.js");
    const binEntrypoint = join(root, ".bin", "hyperstar");
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, ".bin"), { recursive: true });
    await writeFile(realEntrypoint, "#!/usr/bin/env node\n", {
      encoding: "utf8",
    });
    await symlink(realEntrypoint, binEntrypoint);

    expect(
      isDirectCliInvocation(
        pathToFileURL(realEntrypoint).toString(),
        binEntrypoint,
      ),
    ).toBe(true);
  });

  it("logs in through the browser callback and saves token state", async () => {
    const root = await makeTempDir();
    const stdout: string[] = [];
    const openedUrls: string[] = [];
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 3_600,
          }),
          { status: 200 },
        ),
    );

    const exitCode = await runCli(["login"], {
      env: {
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_APP_BASE_URL: "https://app.example.test",
      },
      fetcher,
      openBrowser: async (url) => {
        openedUrls.push(url.toString());
      },
      startCallback: async ({ expectedState }) => ({
        callbackUrl: "http://127.0.0.1:4321/callback",
        result: Promise.resolve({ code: "code-123", state: expectedState }),
        close: async () => undefined,
      }),
      stateStore: store,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(openedUrls[0]).toContain(
      "https://app.example.test/cli/authorize?client_id=hyperstar-local-agent",
    );
    expect(openedUrls[0]).toContain("code_challenge_method=S256");
    await expect(store.read()).resolves.toMatchObject({
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(stdout.join("\n")).toContain("Logged in");
    expect(stdout.join("\n")).not.toContain("access-token");
    expect(stdout.join("\n")).not.toContain("refresh-token");
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/cli-auth/token"),
      expect.objectContaining({
        body: expect.stringContaining(
          '"loopback_redirect":{"host":"ipv4","port":4321}',
        ),
      }),
    );
  });

  it("continues login when the browser opener is unavailable", async () => {
    const root = await makeTempDir();
    const stdout: string[] = [];
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 3_600,
          }),
          { status: 200 },
        ),
    );

    const exitCode = await runCli(["login"], {
      env: {
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_APP_BASE_URL: "https://app.example.test",
      },
      fetcher,
      openBrowser: async () => {
        throw new Error("spawn xdg-open ENOENT");
      },
      startCallback: async ({ expectedState }) => ({
        callbackUrl: "http://127.0.0.1:4321/callback",
        result: Promise.resolve({ code: "code-123", state: expectedState }),
        close: async () => undefined,
      }),
      stateStore: store,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain("Open this URL");
    expect(stdout.join("\n")).toContain(
      "Could not open your browser automatically",
    );
    await expect(store.read()).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("prints the login URL without opening a browser when requested", async () => {
    const root = await makeTempDir();
    const stdout: string[] = [];
    const openedUrls: string[] = [];
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 3_600,
          }),
          { status: 200 },
        ),
    );

    const exitCode = await runCli(["login", "--no-open"], {
      env: {
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_APP_BASE_URL: "https://app.example.test",
      },
      fetcher,
      openBrowser: async (url) => {
        openedUrls.push(url.toString());
      },
      startCallback: async ({ expectedState }) => ({
        callbackUrl: "http://127.0.0.1:4321/callback",
        result: Promise.resolve({ code: "code-123", state: expectedState }),
        close: async () => undefined,
      }),
      stateStore: store,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(openedUrls).toEqual([]);
    expect(stdout.join("\n")).toContain(
      "Hyperstar API: https://api.example.test",
    );
    expect(stdout.join("\n")).toContain(
      "Hyperstar app: https://app.example.test",
    );
    expect(stdout.join("\n")).toContain("Open this URL");
    expect(stdout.join("\n")).toContain(
      "Browser sessions are separate from CLI sessions",
    );
    expect(stdout.join("\n")).toContain(
      "Run `hyperstar workspaces list --json`",
    );
    await expect(store.read()).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("requires an explicit app URL when login targets a custom API", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });

    const exitCode = await runCli(["login"], {
      env: {
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
      },
      stateStore: store,
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(exitCode).toBe(1);
  });

  it("uses the configured app URL when login targets a custom API", async () => {
    const root = await makeTempDir();
    const openedUrls: string[] = [];
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 3_600,
          }),
          { status: 200 },
        ),
    );

    const exitCode = await runCli(["login"], {
      env: {
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_APP_BASE_URL: "https://app.example.test",
      },
      fetcher,
      openBrowser: async (url) => {
        openedUrls.push(url.toString());
      },
      startCallback: async ({ expectedState }) => ({
        callbackUrl: "http://127.0.0.1:4321/callback",
        result: Promise.resolve({ code: "code-123", state: expectedState }),
        close: async () => undefined,
      }),
      stateStore: store,
      stdout: () => undefined,
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(openedUrls[0]).toContain("https://app.example.test/cli/authorize");
  });

  it("clears workspace selection when login stores new tokens", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write(
      authState({
        selectedOrganizationId: "org_old",
      }),
    );
    let inLock = false;
    const interleavingStore: CliAuthStateStore = {
      ...store,
      withExclusiveLock: async (action) => {
        inLock = true;
        try {
          return await store.withExclusiveLock(action);
        } finally {
          inLock = false;
        }
      },
      write: async (state) => {
        await store.write(state);
      },
    };
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 3_600,
          }),
          { status: 200 },
        ),
    );

    const loginPromise = runCli(["login"], {
      env: {
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_APP_BASE_URL: "https://app.example.test",
      },
      fetcher,
      openBrowser: async () => undefined,
      startCallback: async ({ expectedState }) => {
        return {
          callbackUrl: "http://127.0.0.1:4321/callback",
          result: Promise.resolve({ code: "code-123", state: expectedState }),
          close: async () => undefined,
        };
      },
      stateStore: interleavingStore,
      stdout: () => undefined,
      stderr: () => undefined,
    });
    await expect(loginPromise).resolves.toBe(0);

    await expect(store.read()).resolves.toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    await expect(store.read()).resolves.not.toHaveProperty(
      "selectedOrganizationId",
    );
  });

  it("logs out remotely when a refresh token exists and clears local state", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write({
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      refreshToken: "refresh-token",
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-07-09T01:00:00.000Z",
      selectedOrganizationId: "org_123",
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    const stdout: string[] = [];
    const exitCode = await runCli(["logout"], {
      fetcher,
      stateStore: store,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("\n")).toContain(
      "Browser sessions are separate from CLI sessions",
    );
    await expect(store.read()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/cli-auth/logout"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh_token: "refresh-token" }),
      }),
    );
  });

  it("clears local state even when remote logout fails", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write(authState());
    const stderr: string[] = [];
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: "upstream unavailable" }), {
          status: 500,
        }),
    );

    const exitCode = await runCli(["logout"], {
      fetcher,
      stateStore: store,
      stdout: () => undefined,
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    await expect(store.read()).resolves.toBeNull();
    expect(stderr.join("\n")).toContain("Hyperstar logout failed");
  });

  it("does not leave refreshed local tokens after concurrent logout", async () => {
    const root = await makeTempDir();
    const refreshStore = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const logoutStore = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await refreshStore.write(
      authState({
        accessToken: "expired-access",
        accessTokenExpiresAt: "2026-07-09T00:00:00.000Z",
        refreshToken: "refresh-old",
      }),
    );
    const provider = createStoredCliAccessTokenProvider({
      store: refreshStore,
      client: {
        refresh: vi.fn(
          async () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  accessToken: "new-access",
                  refreshToken: "refresh-new",
                  accessTokenExpiresAt: "2026-07-09T01:00:00.000Z",
                });
              }, 10);
            }),
        ),
      } as Parameters<typeof createStoredCliAccessTokenProvider>[0]["client"],
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    const refresh = provider.getAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 1));
    const logoutExitCode = await runCli(["logout"], {
      fetcher: vi.fn(async () => new Response(null, { status: 204 })),
      stateStore: logoutStore,
      stdout: () => undefined,
      stderr: () => undefined,
    });

    await expect(refresh).resolves.toBe("new-access");
    expect(logoutExitCode).toBe(0);
    await expect(logoutStore.read()).resolves.toBeNull();
  });

  it("prints whoami JSON", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write(authState());
    const stdout: string[] = [];
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ actor_type: "user", user_id: "user_1" })),
    );

    const exitCode = await runCli(["whoami", "--json"], {
      fetcher,
      stateStore: store,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join("\n"))).toEqual({
      actor_type: "user",
      user_id: "user_1",
    });
  });

  it("lists workspaces as JSON", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write(authState());
    const stdout: string[] = [];
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            workspaces: [{ organization_id: "org_123", name: "Acme" }],
          }),
        ),
    );

    const exitCode = await runCli(["workspaces", "list", "--json"], {
      fetcher,
      stateStore: store,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join("\n"))).toEqual({
      workspaces: [{ organization_id: "org_123", name: "Acme" }],
    });
  });

  it("persists selected workspace after verifying access", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write(authState({ selectedOrganizationId: undefined }));
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            workspaces: [{ organization_id: "org_456", name: "Beta" }],
          }),
        ),
    );

    const exitCode = await runCli(["workspaces", "use", "org_456"], {
      fetcher,
      stateStore: store,
      stdout: () => undefined,
      stderr: () => undefined,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    expect(exitCode).toBe(0);
    await expect(store.read()).resolves.toMatchObject({
      selectedOrganizationId: "org_456",
    });
  });

  it("preserves rotated refresh tokens when selecting a workspace", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await store.write(
      authState({
        accessToken: "expired-access",
        accessTokenExpiresAt: "2026-07-09T00:00:00.000Z",
        refreshToken: "refresh-old",
      }),
    );
    const fetcher = vi.fn(async (url: URL) => {
      if (url.pathname === "/api/v1/cli-auth/refresh") {
        return new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "refresh-new",
            token_type: "bearer",
            expires_in: 3_600,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          workspaces: [{ organization_id: "org_456", name: "Beta" }],
        }),
      );
    });

    const exitCode = await runCli(["workspaces", "use", "org_456"], {
      fetcher,
      stateStore: store,
      stdout: () => undefined,
      stderr: () => undefined,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    expect(exitCode).toBe(0);
    await expect(store.read()).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "refresh-new",
      selectedOrganizationId: "org_456",
    });
  });
});

async function makeTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "hyperstar-cli-test-"));
  tempDirs.push(path);
  return path;
}

function authState(overrides = {}) {
  return {
    apiBaseUrl: "https://api.example.test",
    appBaseUrl: "https://app.example.test",
    refreshToken: "refresh-token",
    accessToken: "access-token",
    accessTokenExpiresAt: "2026-07-09T01:00:00.000Z",
    selectedOrganizationId: "org_123",
    ...overrides,
  };
}
