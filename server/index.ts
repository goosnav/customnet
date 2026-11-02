import { createApp } from "./app";
import path from "node:path";
const port = Number(process.env.PORT || 4311);
const host = process.env.HOST || "127.0.0.1";
const app = createApp({ staticDir: path.resolve("dist") });
const server = app.listen(port, host, () =>
  console.log(`Customnet is running at http://${host}:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
