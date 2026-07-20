import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFileCliAuthStateStore,
  resolveAuthStatePath,
  type CliAuthState,
} from "../src/auth/cli-auth-state.js";
import {
  createCliAuthClient,
  createStoredCliAccessTokenProvider,
} from "../src/auth/cli-auth-client.js";
import { startLocalCallbackServer } from "../src/auth/local-callback.js";
import { createPkcePair, createState } from "../src/auth/pkce.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((path) => rm(path, { recursive: true })));
  tempDirs.length = 0;
});

describe("PKCE helpers", () => {
  it("creates a URL-safe verifier and matching S256 challenge", () => {
    const pkce = createPkcePair();

    expect(pkce.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(pkce.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pkce.challenge).toBe(
      createHash("sha256").update(pkce.verifier, "ascii").digest("base64url"),
    );
  });

  it("creates URL-safe OAuth state", () => {
    expect(createState()).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
});

describe("local callback server", () => {
  it("binds to 127.0.0.1 and returns the authorization code", async () => {
    const callback = await startLocalCallbackServer({
      expectedState: "state-123",
      timeoutMs: 1_000,
    });

    expect(callback.callbackUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    );

    const response = await fetch(
      `${callback.callbackUrl}?code=code-123&state=state-123`,
    );

    expect(response.status).toBe(200);
    await expect(callback.result).resolves.toEqual({
      code: "code-123",
      state: "state-123",
    });
  });

  it("rejects callbacks with the wrong state and keeps waiting", async () => {
    const callback = await startLocalCallbackServer({
      expectedState: "state-123",
      timeoutMs: 1_000,
    });

    const response = await fetch(
      `${callback.callbackUrl}?code=code-123&state=wrong-state`,
    );

    expect(response.status).toBe(400);
    const validResponse = await fetch(
      `${callback.callbackUrl}?code=code-456&state=state-123`,
    );

    expect(validResponse.status).toBe(200);
    await expect(callback.result).resolves.toEqual({
      code: "code-456",
      state: "state-123",
    });
  });
});

describe("CLI auth state", () => {
  it("resolves the POSIX auth path under XDG_CONFIG_HOME", async () => {
    const root = await makeTempDir();

    expect(
      resolveAuthStatePath({
        env: { XDG_CONFIG_HOME: root },
        platform: "linux",
        homedir: () => "/home/tester",
      }),
    ).toBe(join(root, "hyperstar", "auth.json"));
  });

  it("writes auth state with restrictive permissions on POSIX", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const state = authState();

    await store.write(state);

    await expect(store.read()).resolves.toEqual(state);
    const mode = (await stat(resolveAuthStatePath(store.pathOptions))).mode;
    expect(mode & 0o777).toBe(0o600);
  });

  it("replaces auth state atomically so readers never see partial JSON", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const state = authState();

    await store.write(state);

    await expect(readFile(store.path, "utf8")).resolves.toBe(
      `${JSON.stringify(state, null, 2)}\n`,
    );
    const authDirectoryEntries = await readdir(dirname(store.path));
    expect(authDirectoryEntries).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/)]),
    );
  });

  it("recovers stale auth state locks left by killed processes", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const lockPath = join(dirname(store.path), "auth.json.lock");
    await mkdir(lockPath, {
      recursive: true,
    });
    await writeFile(join(lockPath, "owner.json"), "{}\n", {
      encoding: "utf8",
    });
    const staleTimestamp = new Date(Date.now() - 61_000);
    await utimes(lockPath, staleTimestamp, staleTimestamp);
    await utimes(join(lockPath, "owner.json"), staleTimestamp, staleTimestamp);

    await expect(
      store.withExclusiveLock(async () => "lock-acquired"),
    ).resolves.toBe("lock-acquired");
  });

  it("does not break an old lock while the holder heartbeat is fresh", async () => {
    const root = await makeTempDir();
    const store = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const competingStore = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    let releaseLock!: () => void;
    const lockHeld = store.withExclusiveLock(
      () =>
        new Promise<void>((resolve) => {
          releaseLock = resolve;
        }),
    );
    await sleep(25);
    const lockPath = join(dirname(store.path), "auth.json.lock");
    const staleTimestamp = new Date(Date.now() - 61_000);
    await utimes(lockPath, staleTimestamp, staleTimestamp);
    let competingEntered = false;

    const competing = competingStore
      .withExclusiveLock(async () => {
        competingEntered = true;
      })
      .catch(() => undefined);
    await sleep(50);

    expect(competingEntered).toBe(false);
    releaseLock();
    await lockHeld;
    await competing;
    expect(competingEntered).toBe(true);
  });
});

describe("CLI auth client", () => {
  it("builds the browser authorization URL", () => {
    const client = createCliAuthClient({
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      fetcher: vi.fn(),
    });

    const url = client.buildAuthorizeUrl(
      "http://127.0.0.1:4321/callback",
      { verifier: "verifier-123", challenge: "challenge-123" },
      "state-123",
    );

    expect(url.toString()).toBe(
      "https://app.example.test/cli/authorize?client_id=hyperstar-local-agent&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback&code_challenge=challenge-123&code_challenge_method=S256&state=state-123",
    );
  });

  it("refreshes expired stored access tokens and persists the rotated token", async () => {
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
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "refresh-new",
            token_type: "bearer",
            expires_in: 1_800,
          }),
          { status: 200 },
        ),
    );
    const client = createCliAuthClient({
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      fetcher,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });
    const provider = createStoredCliAccessTokenProvider({
      store,
      client,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    await expect(provider.getAccessToken()).resolves.toBe("new-access");
    await expect(store.read()).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "refresh-new",
      accessTokenExpiresAt: "2026-07-09T01:00:00.000Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/cli-auth/refresh"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          refresh_token: "refresh-old",
        }),
      }),
    );
  });

  it("exchanges authorization codes using the backend token contract", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 900,
          }),
          { status: 200 },
        ),
    );
    const client = createCliAuthClient({
      apiBaseUrl: "https://api.example.test",
      appBaseUrl: "https://app.example.test",
      fetcher,
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    });

    await expect(
      client.exchangeCode(
        "code-123",
        "verifier-123",
        "http://127.0.0.1:4321/callback",
      ),
    ).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2026-07-09T00:15:00.000Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/v1/cli-auth/token"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "code-123",
          code_verifier: "verifier-123",
          client_id: "hyperstar-local-agent",
          loopback_redirect: {
            host: "ipv4",
            port: 4321,
          },
        }),
      }),
    );
  });

  it("coalesces concurrent refreshes so rotated tokens are used once", async () => {
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
    const client = {
      refresh: vi.fn(
        async () =>
          new Promise<{
            accessToken: string;
            refreshToken: string;
            accessTokenExpiresAt: string;
          }>((resolve) => {
            setTimeout(() => {
              resolve({
                accessToken: "new-access",
                refreshToken: "refresh-new",
                accessTokenExpiresAt: "2026-07-09T01:00:00.000Z",
              });
            }, 1);
          }),
      ),
    };
    const provider = createStoredCliAccessTokenProvider({
      store,
      client: client as ReturnType<typeof createCliAuthClient>,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    await expect(
      Promise.all([provider.getAccessToken(), provider.getAccessToken()]),
    ).resolves.toEqual(["new-access", "new-access"]);
    expect(client.refresh).toHaveBeenCalledOnce();
  });

  it("serializes refreshes across providers sharing one auth file", async () => {
    const root = await makeTempDir();
    const firstStore = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    const secondStore = createFileCliAuthStateStore({
      env: { XDG_CONFIG_HOME: root },
      platform: "linux",
      homedir: () => "/home/tester",
    });
    await firstStore.write(
      authState({
        accessToken: "expired-access",
        accessTokenExpiresAt: "2026-07-09T00:00:00.000Z",
        refreshToken: "refresh-old",
      }),
    );
    const client = {
      refresh: vi.fn(
        async () =>
          new Promise<{
            accessToken: string;
            refreshToken: string;
            accessTokenExpiresAt: string;
          }>((resolve) => {
            setTimeout(() => {
              resolve({
                accessToken: "new-access",
                refreshToken: "refresh-new",
                accessTokenExpiresAt: "2026-07-09T01:00:00.000Z",
              });
            }, 1);
          }),
      ),
    };
    const firstProvider = createStoredCliAccessTokenProvider({
      store: firstStore,
      client: client as ReturnType<typeof createCliAuthClient>,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });
    const secondProvider = createStoredCliAccessTokenProvider({
      store: secondStore,
      client: client as ReturnType<typeof createCliAuthClient>,
      now: () => new Date("2026-07-09T00:30:00.000Z"),
    });

    await expect(
      Promise.all([
        firstProvider.getAccessToken(),
        secondProvider.getAccessToken(),
      ]),
    ).resolves.toEqual(["new-access", "new-access"]);
    expect(client.refresh).toHaveBeenCalledOnce();
  });
});

async function makeTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "hyperstar-mcp-test-"));
  tempDirs.push(path);
  return path;
}

function authState(overrides: Partial<CliAuthState> = {}): CliAuthState {
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
