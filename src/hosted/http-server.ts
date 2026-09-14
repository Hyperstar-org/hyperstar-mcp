import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { HostedConfig } from "./config.js";

export function createNodeHostedServer(
  config: HostedConfig,
  handle: (request: Request) => Promise<Response>,
) {
  const pending = new Set<AbortController>();

  async function dispatch(
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ): Promise<void> {
    const controller = new AbortController();
    pending.add(controller);
    const timeout = setTimeout(() => controller.abort(), 230_000);
    incoming.once("aborted", () => controller.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableEnded) controller.abort();
    });
    try {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of incoming) {
        const value: Uint8Array = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk);
        bytes += value.byteLength;
        if (bytes > 1024 * 1024) {
          outgoing.writeHead(413);
          outgoing.end();
          return;
        }
        chunks.push(value);
      }
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        const name = incoming.rawHeaders[index];
        const value = incoming.rawHeaders[index + 1];
        if (name !== undefined && value !== undefined)
          headers.append(name, value);
      }
      const method = incoming.method ?? "GET";
      const request = new Request(
        new URL(incoming.url ?? "/", config.resource),
        {
          method,
          headers,
          signal: controller.signal,
          ...(method === "GET" || method === "HEAD"
            ? {}
            : { body: Buffer.concat(chunks) }),
        },
      );
      const response = await handle(request);
      if (outgoing.destroyed) return;
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent)
        outgoing.writeHead(controller.signal.aborted ? 503 : 400, {
          "Content-Type": "application/json",
        });
      outgoing.end(
        JSON.stringify({
          error: controller.signal.aborted
            ? "temporarily_unavailable"
            : "invalid_request",
        }),
      );
    } finally {
      clearTimeout(timeout);
      pending.delete(controller);
    }
  }

  const server = createServer((request, response) => {
    void dispatch(request, response);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return {
    server,
    shutdown: () => {
      server.close();
      server.closeIdleConnections();
      const deadline = setTimeout(() => {
        for (const controller of pending) controller.abort();
        server.closeAllConnections();
      }, 25_000);
      deadline.unref();
      server.once("close", () => clearTimeout(deadline));
    },
  };
}
