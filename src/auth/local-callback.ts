import { createServer, type Server } from "node:http";

export type LocalCallbackResult =
  | {
      readonly code: string;
      readonly state: string;
    }
  | {
      readonly error: string;
      readonly state?: string;
    };

export type LocalCallbackServer = {
  readonly callbackUrl: string;
  readonly result: Promise<LocalCallbackResult>;
  readonly close: () => Promise<void>;
};

export type LocalCallbackOptions = {
  readonly expectedState: string;
  readonly timeoutMs?: number;
};

/** Start a one-shot OAuth callback server bound to 127.0.0.1. */
export async function startLocalCallbackServer(
  options: LocalCallbackOptions,
): Promise<LocalCallbackServer> {
  let settle!: (result: LocalCallbackResult) => void;
  const result = new Promise<LocalCallbackResult>((resolve) => {
    settle = resolve;
  });
  const timeoutMs = options.timeoutMs ?? 120_000;
  let settled = false;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname !== "/callback") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const state = requestUrl.searchParams.get("state") ?? undefined;
    const code = requestUrl.searchParams.get("code") ?? undefined;
    const error = requestUrl.searchParams.get("error") ?? undefined;
    if (state !== options.expectedState) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Invalid state");
      return;
    }
    if (error !== undefined && error.length > 0) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Authorization failed");
      finish({ error, state });
      return;
    }
    if (code === undefined || code.length === 0) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Missing code");
      finish({ error: "missing_code", state });
      return;
    }

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("Hyperstar login complete. You can close this window.");
    finish({ code, state });
  });

  const close = async (): Promise<void> => closeServer(server);
  const timeout = setTimeout(() => {
    finish({ error: "timeout" });
  }, timeoutMs);
  timeout.unref();

  /** Resolve once and close the one-shot callback server. */
  function finish(callbackResult: LocalCallbackResult): void {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    settle(callbackResult);
    void close();
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await close();
    throw new Error("Failed to bind local callback server");
  }

  return {
    callbackUrl: `http://127.0.0.1:${address.port}/callback`,
    result,
    close,
  };
}

/** Close a Node HTTP server if it is still listening. */
async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
