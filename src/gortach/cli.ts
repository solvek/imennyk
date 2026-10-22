// Usage: pnpm gortach [--root import/indexing] [--port 8090] [--ssh user@host]
import { hostname, userInfo } from "node:os";
import { parseArgs } from "node:util";
import { startGortach } from "./server.ts";
import { startupMessage } from "./startup.ts";

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "import/indexing" },
    port: { type: "string", default: "8090" },
    ssh: { type: "string" },
  },
});

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`--port must be an integer from 0 to 65535, got ${values.port}`);
}

// Only the local address: the application has no sign-in, so it is reached through a tunnel.
const gortach = await startGortach({ root: values.root, port, host: "127.0.0.1" });
console.log(
  startupMessage({
    port: gortach.port,
    ssh: values.ssh ?? `${userInfo().username}@${hostname()}`,
  }),
);
