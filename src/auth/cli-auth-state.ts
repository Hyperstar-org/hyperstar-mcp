import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir as defaultHomedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const STALE_LOCK_MS = 60_000;
const LOCK_HEARTBEAT_MS = 5_000;
const AUTH_SESSION_ID_BYTES = 16;

export type CliAuthState = {
  readonly apiBaseUrl: string;
  readonly appBaseUrl: string;
  readonly authSessionId?: string;
  readonly refreshToken: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly selectedOrganizationId?: string;
};

export type AuthStatePathOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly homedir?: () => string;
};

export type CliAuthStateStore = {
  readonly pathOptions: AuthStatePathOptions;
  readonly path: string;
  readonly read: () => Promise<CliAuthState | null>;
  readonly readSync: () => CliAuthState | null;
  readonly write: (state: CliAuthState) => Promise<void>;
  readonly clear: () => Promise<void>;
  readonly withExclusiveLock: <T>(action: () => Promise<T>) => Promise<T>;
};

/** Create a local opaque id for one browser-login auth session. */
export function createAuthSessionId(): string {
  return randomBytes(AUTH_SESSION_ID_BYTES).toString("hex");
}

/** Resolve the local CLI auth state path for the current OS conventions. */
export function resolveAuthStatePath(
  options: AuthStatePathOptions = {},
): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homedir = options.homedir ?? defaultHomedir;

  if (platform === "win32") {
    return join(
      env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Hyperstar",
      "auth.json",
    );
  }

  return join(
    env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "hyperstar",
    "auth.json",
  );
}

/** Create a file-backed CLI auth state store. */
export function createFileCliAuthStateStore(
  options: AuthStatePathOptions = {},
): CliAuthStateStore {
  const path = resolveAuthStatePath(options);
  return {
    pathOptions: options,
    path,
    read: async () => readAuthState(path),
    readSync: () => readAuthStateSync(path),
    write: async (state) => writeAuthState(path, state),
    clear: async () => {
      await rm(path, { force: true });
    },
    withExclusiveLock: async (action) => withAuthStateLock(path, action),
  };
}

/** Read auth state JSON from disk. */
async function readAuthState(path: string): Promise<CliAuthState | null> {
  try {
    return parseAuthState(await readFile(path, "utf8"));
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/** Read auth state JSON synchronously for process startup configuration. */
function readAuthStateSync(path: string): CliAuthState | null {
  if (!existsSync(path)) {
    return null;
  }
  return parseAuthState(readFileSync(path, "utf8"));
}

/** Write auth state JSON with restrictive permissions where the OS supports it. */
async function writeAuthState(
  path: string,
  state: CliAuthState,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
    await chmod(tempPath, 0o600);
  }
  await rename(tempPath, path);
}

/** Parse and minimally validate persisted auth state. */
function parseAuthState(raw: string): CliAuthState {
  const value = JSON.parse(raw) as Partial<CliAuthState>;
  if (
    typeof value.apiBaseUrl !== "string" ||
    typeof value.appBaseUrl !== "string" ||
    typeof value.refreshToken !== "string" ||
    typeof value.accessToken !== "string" ||
    typeof value.accessTokenExpiresAt !== "string"
  ) {
    throw new Error(
      "Hyperstar auth state is invalid; run `hyperstar login` again",
    );
  }

  return {
    apiBaseUrl: value.apiBaseUrl,
    appBaseUrl: value.appBaseUrl,
    ...(typeof value.authSessionId === "string"
      ? { authSessionId: value.authSessionId }
      : {}),
    refreshToken: value.refreshToken,
    accessToken: value.accessToken,
    accessTokenExpiresAt: value.accessTokenExpiresAt,
    ...(typeof value.selectedOrganizationId === "string"
      ? { selectedOrganizationId: value.selectedOrganizationId }
      : {}),
  };
}

/** Return true when a filesystem error is an ENOENT. */
function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/** Run an auth-state operation under a filesystem lock shared by CLI processes. */
async function withAuthStateLock<T>(
  path: string,
  action: () => Promise<T>,
): Promise<T> {
  const release = await acquireAuthStateLock(`${path}.lock`);
  try {
    return await action();
  } finally {
    await release();
  }
}

/** Acquire a directory lock using atomic mkdir. */
async function acquireAuthStateLock(
  lockPath: string,
): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });

  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      return await holdAuthStateLock(lockPath);
    } catch (error) {
      if (!isAlreadyExistsError(error) || Date.now() - startedAt > 10_000) {
        throw new Error("Timed out waiting for Hyperstar auth state lock");
      }
      await removeStaleAuthStateLock(lockPath);
      await sleep(25);
    }
  }
}

/** Write owner metadata and keep the lock heartbeat fresh until release. */
async function holdAuthStateLock(
  lockPath: string,
): Promise<() => Promise<void>> {
  await writeLockHeartbeat(lockPath);
  const heartbeat = setInterval(() => {
    void writeLockHeartbeat(lockPath).catch(() => undefined);
  }, LOCK_HEARTBEAT_MS);
  return async () => {
    clearInterval(heartbeat);
    await rm(lockPath, { force: true, recursive: true });
  };
}

/** Refresh the lock heartbeat file used to distinguish live and stale locks. */
async function writeLockHeartbeat(lockPath: string): Promise<void> {
  await writeFile(
    join(lockPath, "owner.json"),
    `${JSON.stringify({ pid: process.pid, updated_at: new Date().toISOString() })}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

/** Remove lock directories old enough to have been left by a killed process. */
async function removeStaleAuthStateLock(lockPath: string): Promise<void> {
  try {
    const heartbeatStat = await stat(join(lockPath, "owner.json"));
    if (Date.now() - heartbeatStat.mtimeMs >= STALE_LOCK_MS) {
      await rm(lockPath, { force: true, recursive: true });
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      await removeLockDirectoryIfStale(lockPath);
      return;
    }
    throw error;
  }
}

/** Remove a lock directory only when it still exists and is stale. */
async function removeLockDirectoryIfStale(lockPath: string): Promise<void> {
  try {
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs >= STALE_LOCK_MS) {
      await rm(lockPath, { force: true, recursive: true });
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

/** Return true when a filesystem error means the lock already exists. */
function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}
