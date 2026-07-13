import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";
import type { Service } from "./service.ts";
import { test } from "./test_runner.ts";
import {
  buildSshArgs,
  type SpawnSsh,
  startTunnelProcess,
  TunnelSetupError,
  TunnelStartupError,
} from "./tunnel_process.ts";

const PINNED_SERVICE: Service = {
  host: "tunnel.example.com:2222",
  port: 80,
  urlPattern: /https:\/\/[a-z]+\.example\.com/,
  knownHosts: {
    "[tunnel.example.com]:2222": [
      "ssh-ed25519 AAAAfirst",
      "ssh-rsa AAAAsecond",
    ],
  },
};

class FakeSshProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = 1234;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;

  kill(_signal?: NodeJS.Signals | number): boolean {
    if (this.exitCode != null || this.signalCode != null) return false;
    this.killed = true;
    queueMicrotask(() => this.close(null, "SIGTERM"));
    return true;
  }

  close(
    code: number | null = 0,
    signal: NodeJS.Signals | null = null,
  ): void {
    if (this.exitCode != null || this.signalCode != null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("close", code, signal);
  }
}

class PausingPassThrough extends PassThrough {
  override off(event: string | symbol, listener: (...args: unknown[]) => void) {
    super.off(event, listener);
    if (event === "data" && this.listenerCount("data") < 1) this.pause();
    return this;
  }
}

class StubbornSshProcess extends FakeSshProcess {
  readonly signals: (NodeJS.Signals | number | undefined)[] = [];

  override kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.signals.push(signal);
    return false;
  }
}

function getOption(args: readonly string[], name: string): string {
  const prefix = `${name}=`;
  const option = args.find((arg) => arg.startsWith(prefix));
  assert.ok(option, `Missing SSH option: ${name}`);
  return option.slice(prefix.length);
}

function decodeSshConfigPath(value: string): string {
  assert.match(value, /^".*"$/);
  return value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
}

async function assertEventuallyMissing(path: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await stat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Temporary path still exists: ${path}`);
}

async function assertKnownHostsRemoved(path: string): Promise<void> {
  await assert.rejects(stat(path), { code: "ENOENT" });
  await assert.rejects(stat(dirname(path)), { code: "ENOENT" });
}

test("buildSshArgs keeps the legacy behavior for unpinned services", () => {
  const args = buildSshArgs(
    {
      host: "tunnel.example.com",
      port: 80,
      urlPattern: /example/,
    },
    8000,
  );

  assert.deepEqual(args.slice(0, 5), [
    "-p",
    "22",
    "-o",
    "StrictHostKeyChecking=no",
    "-R",
  ]);
});

test("buildSshArgs locks host verification before extra options", () => {
  const args = buildSshArgs(
    {
      ...PINNED_SERVICE,
      extraOptions: [
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=attacker_known_hosts",
        "-o",
        "KnownHostsCommand=attacker-command",
      ],
    },
    8000,
    "/tmp/local tunnel/known_hosts",
  );

  const strictValues = args.filter((arg) =>
    arg.startsWith("StrictHostKeyChecking=")
  );
  const userKnownHostsValues = args.filter((arg) =>
    arg.startsWith("UserKnownHostsFile=")
  );
  const knownHostsCommandValues = args.filter((arg) =>
    arg.startsWith("KnownHostsCommand=")
  );

  assert.deepEqual(strictValues, [
    "StrictHostKeyChecking=yes",
    "StrictHostKeyChecking=no",
  ]);
  assert.deepEqual(userKnownHostsValues, [
    'UserKnownHostsFile="/tmp/local tunnel/known_hosts"',
    "UserKnownHostsFile=attacker_known_hosts",
  ]);
  assert.deepEqual(knownHostsCommandValues, [
    "KnownHostsCommand=none",
    "KnownHostsCommand=attacker-command",
  ]);
  assert.ok(
    args.indexOf("StrictHostKeyChecking=yes") <
      args.indexOf("StrictHostKeyChecking=no"),
  );
  assert.ok(args.includes("VerifyHostKeyDNS=no"));
  assert.ok(args.includes("CheckHostIP=no"));
  assert.ok(args.includes("UpdateHostKeys=no"));
});

test("startTunnelProcess opens with matching pins and cleans up on close", async () => {
  const process = new FakeSshProcess();
  let knownHostsPath = "";
  const spawn: SpawnSsh = (_command, args) => {
    knownHostsPath = decodeSshConfigPath(
      getOption(args, "UserKnownHostsFile"),
    );
    assert.equal(
      readFileSync(knownHostsPath, "utf8"),
      [
        "[tunnel.example.com]:2222 ssh-ed25519 AAAAfirst",
        "[tunnel.example.com]:2222 ssh-rsa AAAAsecond",
        "",
      ].join("\n"),
    );
    queueMicrotask(() => process.stdout.write("https://matched.example.com\n"));
    return process as unknown as ChildProcess;
  };

  const tunnel = await startTunnelProcess(PINNED_SERVICE, 8000, 1_000, spawn);

  assert.equal(tunnel.url.href, "https://matched.example.com/");
  await stat(knownHostsPath);
  await tunnel.close();
  assert.equal(process.killed, true);
  await assertKnownHostsRemoved(knownHostsPath);
  await tunnel.close();
});

test("startTunnelProcess keeps draining stderr after startup", async () => {
  const process = new FakeSshProcess();
  const stderr = new PausingPassThrough();
  Object.defineProperty(process, "stderr", { value: stderr });
  const spawn: SpawnSsh = () => {
    queueMicrotask(() => process.stdout.write("https://live.example.com\n"));
    return process as unknown as ChildProcess;
  };

  const tunnel = await startTunnelProcess(PINNED_SERVICE, 8000, 1_000, spawn);

  try {
    assert.equal(stderr.readableFlowing, true);
  } finally {
    await tunnel.close();
  }
});

test("startTunnelProcess rejects a host-key mismatch and cleans up", async () => {
  const process = new FakeSshProcess();
  let knownHostsPath = "";
  const spawn: SpawnSsh = (_command, args) => {
    knownHostsPath = decodeSshConfigPath(
      getOption(args, "UserKnownHostsFile"),
    );
    queueMicrotask(() => {
      process.stderr.write("Host key verification failed.\n");
      process.close(255);
    });
    return process as unknown as ChildProcess;
  };

  await assert.rejects(
    startTunnelProcess(PINNED_SERVICE, 8000, 1_000, spawn),
    (error) =>
      error instanceof TunnelStartupError &&
      error.stderr === "Host key verification failed.\n",
  );
  await assertKnownHostsRemoved(knownHostsPath);
});

test("startTunnelProcess cleans up after a startup timeout", async () => {
  const process = new FakeSshProcess();
  let knownHostsPath = "";
  const spawn: SpawnSsh = (_command, args) => {
    knownHostsPath = decodeSshConfigPath(
      getOption(args, "UserKnownHostsFile"),
    );
    return process as unknown as ChildProcess;
  };

  await assert.rejects(
    startTunnelProcess(PINNED_SERVICE, 8000, 1, spawn),
    { name: "TunnelStartupError", message: /Timed out/ },
  );
  assert.equal(process.killed, true);
  await assertKnownHostsRemoved(knownHostsPath);
});

test("startTunnelProcess does not wait indefinitely for SSH to close", async () => {
  const process = new StubbornSshProcess();
  let knownHostsPath = "";
  const spawn: SpawnSsh = (_command, args) => {
    knownHostsPath = decodeSshConfigPath(
      getOption(args, "UserKnownHostsFile"),
    );
    return process as unknown as ChildProcess;
  };

  const startup = startTunnelProcess(
    PINNED_SERVICE,
    8000,
    1,
    spawn,
    5,
  );
  const result = await Promise.race([
    startup.then(
      () => "resolved" as const,
      () => "rejected" as const,
    ),
    new Promise<"pending">((resolve) =>
      setTimeout(() => resolve("pending"), 50)
    ),
  ]);
  process.close(null, "SIGKILL");
  await startup.catch(() => undefined);

  assert.equal(result, "rejected");
  assert.ok(process.signals.includes("SIGKILL"));
  await assertKnownHostsRemoved(knownHostsPath);
});

test("startTunnelProcess cleans up when spawning SSH throws", async () => {
  let knownHostsPath = "";
  const spawn: SpawnSsh = (_command, args) => {
    knownHostsPath = decodeSshConfigPath(
      getOption(args, "UserKnownHostsFile"),
    );
    throw new Error("spawn failed");
  };

  await assert.rejects(
    startTunnelProcess(PINNED_SERVICE, 8000, 1_000, spawn),
    { message: "spawn failed" },
  );
  await assertKnownHostsRemoved(knownHostsPath);
});

test("startTunnelProcess identifies local known-hosts setup errors", async () => {
  const setupError = new Error("temporary directory is not writable");

  await assert.rejects(
    startTunnelProcess(
      PINNED_SERVICE,
      8000,
      1_000,
      () => assert.fail("SSH must not be spawned"),
      5,
      async () => {
        throw setupError;
      },
    ),
    (error) => error instanceof TunnelSetupError && error.cause === setupError,
  );
});

test("startTunnelProcess cleans up when SSH argument construction fails", async () => {
  let cleaned = false;
  const malformedService = {
    ...PINNED_SERVICE,
    host: undefined,
  } as unknown as Service;

  await assert.rejects(
    startTunnelProcess(
      malformedService,
      8000,
      1_000,
      () => assert.fail("SSH must not be spawned"),
      5,
      async () => ({
        directory: "/tmp/localtunnel-test",
        path: "/tmp/localtunnel-test/known_hosts",
        async cleanup() {
          cleaned = true;
        },
      }),
    ),
    TypeError,
  );
  assert.equal(cleaned, true);
});

test("startTunnelProcess cleans up after an unexpected process exit", async () => {
  const process = new FakeSshProcess();
  let knownHostsPath = "";
  const spawn: SpawnSsh = (_command, args) => {
    knownHostsPath = decodeSshConfigPath(
      getOption(args, "UserKnownHostsFile"),
    );
    queueMicrotask(() => process.stdout.write("https://live.example.com\n"));
    return process as unknown as ChildProcess;
  };
  const tunnel = await startTunnelProcess(PINNED_SERVICE, 8000, 1_000, spawn);

  process.close(0);

  await assertEventuallyMissing(dirname(knownHostsPath));
  await tunnel.close();
});
