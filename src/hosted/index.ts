import { createHostedTokenVerifier } from "./auth.js";
import { readHostedConfig } from "./config.js";
import { createHostedHandler } from "./handler.js";
import { createNodeHostedServer } from "./http-server.js";

const config = readHostedConfig(process.env);
const handle = createHostedHandler({
  config,
  verify: createHostedTokenVerifier(config),
  log: (event) => console.log(JSON.stringify(event)),
});
const { server, shutdown } = createNodeHostedServer(config, handle);
server.listen(config.port, "0.0.0.0", () =>
  console.log(JSON.stringify({ event: "listening", port: config.port })),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, shutdown);
