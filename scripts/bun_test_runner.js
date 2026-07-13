import { test } from "bun:test";

globalThis.__localtunnelNativeTest = test;

await Promise.all([
  import("../src/known_hosts.test.ts"),
  import("../src/service.test.ts"),
  import("../src/ssh_tunnel.test.ts"),
  import("../src/tunnel_process.test.ts"),
]);
