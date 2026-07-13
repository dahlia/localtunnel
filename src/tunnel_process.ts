import { getLogger } from "@logtape/logtape";
import { type ChildProcess, spawn } from "node:child_process";
import { createKnownHostsFile, formatSshConfigPath } from "./known_hosts.ts";
import type { Service } from "./service.ts";

const logger = getLogger("localtunnel");

export const DEFAULT_STARTUP_TIMEOUT = 10_000;
export const MAX_STARTUP_TIMEOUT = 2_147_483_647;
const DEFAULT_TERMINATION_TIMEOUT = 1_000;

export function validateStartupTimeout(timeout: number): void {
  if (
    !Number.isFinite(timeout) || timeout < 0 || timeout > MAX_STARTUP_TIMEOUT
  ) {
    throw new RangeError(
      `The startup timeout must be between 0 and ${MAX_STARTUP_TIMEOUT} milliseconds.`,
    );
  }
}

export class TunnelStartupError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr = "",
  ) {
    super(message);
    this.name = "TunnelStartupError";
  }
}

export class TunnelSetupError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "TunnelSetupError";
    this.cause = cause;
  }
}

export type SpawnSsh = (
  command: string,
  args: string[],
  options: { stdio: ["pipe", "pipe", "pipe"] },
) => ChildProcess;

const spawnSsh: SpawnSsh = (command, args, options) =>
  spawn(command, args, options);

export function buildSshArgs(
  service: Service,
  localPort: number,
  knownHostsPath?: string,
): string[] {
  const sshLoc = service.host.split(":");
  const sshHost = sshLoc[0];
  const sshPort = sshLoc[1] ?? "22";
  const hostKeyOptions = knownHostsPath == null
    ? ["-o", "StrictHostKeyChecking=no"]
    : [
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${formatSshConfigPath(knownHostsPath)}`,
      "-o",
      `GlobalKnownHostsFile=${formatSshConfigPath(knownHostsPath)}`,
      "-o",
      "KnownHostsCommand=none",
      "-o",
      "VerifyHostKeyDNS=no",
      "-o",
      "CheckHostIP=no",
      "-o",
      "UpdateHostKeys=no",
    ];

  return [
    "-p",
    sshPort,
    ...hostKeyOptions,
    "-R",
    `${service.port}:localhost:${localPort}`,
    ...(service.extraOptions ?? []),
    service.user == null ? sshHost : `${service.user}@${sshHost}`,
    ...(service.extraArgs ?? []),
  ];
}

export interface StartedTunnelProcess {
  readonly url: URL;
  readonly pid: number | undefined;
  close(): Promise<void>;
}

export async function startTunnelProcess(
  service: Service,
  localPort: number,
  startupTimeout: number,
  spawnProcess: SpawnSsh = spawnSsh,
  terminationTimeout: number = DEFAULT_TERMINATION_TIMEOUT,
  createKnownHosts: typeof createKnownHostsFile = createKnownHostsFile,
): Promise<StartedTunnelProcess> {
  let knownHostsFile:
    | Awaited<ReturnType<typeof createKnownHostsFile>>
    | undefined;
  try {
    knownHostsFile = service.knownHosts == null
      ? undefined
      : await createKnownHosts(service.knownHosts);
  } catch (error) {
    throw new TunnelSetupError(
      "Failed to create the temporary known_hosts file.",
      error,
    );
  }

  const cleanupAfterError = async (
    error: unknown,
    message: string,
  ): Promise<never> => {
    if (knownHostsFile != null) {
      try {
        await knownHostsFile.cleanup();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], message);
      }
    }
    throw error;
  };

  let args: string[];
  try {
    args = buildSshArgs(service, localPort, knownHostsFile?.path);
  } catch (error) {
    return await cleanupAfterError(
      error,
      "Failed to build SSH arguments and clean up the temporary known_hosts file.",
    );
  }

  logger.debug(
    "Spawning the ssh process: {command}",
    { command: { command: "ssh", args } },
  );

  let process: ChildProcess;
  try {
    process = spawnProcess("ssh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    return await cleanupAfterError(
      error,
      "Failed to spawn SSH and clean up its temporary known_hosts file.",
    );
  }

  let processHasClosed = false;
  const processClosed = new Promise<void>((resolve) => {
    process.once("close", () => {
      processHasClosed = true;
      resolve();
    });
  });
  const cleanupAfterClose = processClosed.then(() => knownHostsFile?.cleanup());
  void cleanupAfterClose.catch((error) => {
    logger.error("Failed to remove the temporary known_hosts file: {error}", {
      error,
    });
  });

  const waitForProcessClose = async (): Promise<boolean> => {
    if (processHasClosed) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        processClosed.then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), terminationTimeout);
        }),
      ]);
    } finally {
      if (timer != null) clearTimeout(timer);
    }
  };
  const terminateProcess = async (): Promise<boolean> => {
    if (processHasClosed) return true;
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
      try {
        process.kill(signal);
      } catch (error) {
        logger.warning("Failed to send {signal} to the SSH process: {error}", {
          signal,
          error,
        });
      }
      if (await waitForProcessClose()) return true;
    }
    logger.error(
      "The SSH process did not close after SIGTERM and SIGKILL; continuing cleanup.",
    );
    return processHasClosed;
  };
  const cleanupProcess = async (closed: boolean): Promise<void> => {
    if (closed) {
      await cleanupAfterClose;
    } else {
      await knownHostsFile?.cleanup();
    }
  };

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= (async () => {
      logger.debug("Closing the tunnel...");
      const closed = await terminateProcess();
      await cleanupProcess(closed);
      if (!closed) {
        throw new Error("Failed to terminate the SSH process.");
      }
    })();
    return closePromise;
  };

  try {
    const url = await waitForTunnelUrl(
      process,
      service.urlPattern,
      startupTimeout,
    );
    return { url, pid: process.pid, close };
  } catch (error) {
    const closed = await terminateProcess();
    try {
      await cleanupProcess(closed);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Tunnel startup failed and its temporary known_hosts file could not be removed.",
      );
    }
    throw error;
  }
}

/**
 * Waits for a tunnel service to print its public URL.
 *
 * The SSH process is deliberately left running after the URL is found.  It is
 * only terminated when the startup deadline expires.
 */
export function waitForTunnelUrl(
  process: ChildProcess,
  urlPattern: RegExp,
  timeout: number,
): Promise<URL> {
  validateStartupTimeout(timeout);
  return new Promise<URL>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanupStartup = () => {
      clearTimeout(timer);
      process.stdout?.off("data", onStdoutData);
      process.stderr?.off("data", onStderrData);
      process.stdout?.resume();
      process.stderr?.resume();
    };
    const cleanupProcess = () => {
      process.off("close", onClose);
      process.off("error", onError);
    };
    const succeed = (url: URL) => {
      if (settled) return;
      settled = true;
      cleanupStartup();
      resolve(url);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanupStartup();
      reject(error);
    };
    const onStdoutData = (data: Uint8Array | string) => {
      stdout += data.toString();
      urlPattern.lastIndex = 0;
      const match = urlPattern.exec(stdout);
      if (match != null) {
        try {
          succeed(new URL(match[0]));
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
          process.kill();
        }
      }
    };
    const onStderrData = (data: Uint8Array | string) => {
      stderr += data.toString();
    };
    const onClose = () => {
      fail(
        new TunnelStartupError("The tunnel URL is not found.", stdout, stderr),
      );
      cleanupProcess();
    };
    const onError = (error: Error) => {
      fail(error);
    };
    const timer = setTimeout(() => {
      fail(
        new TunnelStartupError(
          `Timed out waiting for the tunnel URL after ${timeout} ms.`,
          stdout,
          stderr,
        ),
      );
      process.kill();
    }, timeout);

    process.stdout?.on("data", onStdoutData);
    process.stderr?.on("data", onStderrData);
    process.on("close", onClose);
    process.on("error", onError);
  });
}
