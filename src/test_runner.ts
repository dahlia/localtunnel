import { test as nodeTest } from "node:test";

// Bun 1.2's node:test compatibility layer does not reliably await asynchronous
// tests under `bun test`, so scripts/bun_test_runner.js injects its native
// test function before loading the test modules.
const testEnvironment = globalThis as typeof globalThis & {
  __localtunnelNativeTest?: typeof nodeTest;
};

export const test = testEnvironment.__localtunnelNativeTest ?? nodeTest;
