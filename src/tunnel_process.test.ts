import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "./test_runner.ts";
import {
  MAX_STARTUP_TIMEOUT,
  TunnelStartupError,
  validateStartupTimeout,
  waitForTunnelUrl,
} from "./tunnel_process.ts";

class FakeProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

test("validateStartupTimeout accepts the runtime timer boundaries", () => {
  assert.doesNotThrow(() => validateStartupTimeout(0));
  assert.doesNotThrow(() => validateStartupTimeout(MAX_STARTUP_TIMEOUT));
});

test("validateStartupTimeout rejects timer-overflowing deadlines", () => {
  assert.throws(
    () => validateStartupTimeout(MAX_STARTUP_TIMEOUT + 1),
    {
      name: "RangeError",
      message:
        "The startup timeout must be between 0 and 2147483647 milliseconds.",
    },
  );
});

test("waitForTunnelUrl resolves when the URL arrives in chunks", async () => {
  const process = new FakeProcess();
  const result = waitForTunnelUrl(
    process as unknown as ChildProcess,
    /https:\/\/[a-z]+\.example\.com/,
    1_000,
  );

  process.stdout.write("https://tun");
  process.stdout.write("nel.example.com\n");

  assert.equal((await result).href, "https://tunnel.example.com/");
  assert.equal(process.killed, false);
});

test("waitForTunnelUrl handles process errors after startup", async () => {
  const process = new FakeProcess();
  const result = waitForTunnelUrl(
    process as unknown as ChildProcess,
    /https:\/\/[a-z]+\.example\.com/,
    1_000,
  );

  process.stdout.write("https://tunnel.example.com\n");
  await result;

  assert.doesNotThrow(() => process.emit("error", new Error("late error")));
  process.emit("close", 1);
  assert.equal(process.listenerCount("error"), 0);
});

test("waitForTunnelUrl rejects invalid matched URLs", async () => {
  const process = new FakeProcess();
  const result = waitForTunnelUrl(
    process as unknown as ChildProcess,
    /not-a-url/,
    1_000,
  );

  process.stdout.write("not-a-url");

  await assert.rejects(result, TypeError);
  assert.equal(process.killed, true);
});

test("waitForTunnelUrl rejects when the process exits first", async () => {
  const process = new FakeProcess();
  const result = waitForTunnelUrl(
    process as unknown as ChildProcess,
    /https:\/\/[^\s]+\.example\.com/,
    1_000,
  );

  process.stdout.write("service output");
  process.emit("close", 1);

  await assert.rejects(result, {
    name: "TunnelStartupError",
    message: "The tunnel URL is not found.",
    stdout: "service output",
  });
});

test("waitForTunnelUrl rejects process errors", async () => {
  const process = new FakeProcess();
  const result = waitForTunnelUrl(
    process as unknown as ChildProcess,
    /https:\/\/[^\s]+\.example\.com/,
    1_000,
  );
  const error = new Error("spawn failed");

  process.emit("error", error);

  await assert.rejects(result, error);
});

test("waitForTunnelUrl terminates a process after the startup timeout", async () => {
  const process = new FakeProcess();
  const result = waitForTunnelUrl(
    process as unknown as ChildProcess,
    /https:\/\/[^\s]+\.example\.com/,
    10,
  );

  await assert.rejects(
    result,
    (error) =>
      error instanceof TunnelStartupError &&
      error.message === "Timed out waiting for the tunnel URL after 10 ms.",
  );
  assert.equal(process.killed, true);
});
