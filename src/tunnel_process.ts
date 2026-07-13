import type { ChildProcess } from "node:child_process";

export const DEFAULT_STARTUP_TIMEOUT = 10_000;
export const MAX_STARTUP_TIMEOUT = 2_147_483_647;

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
  constructor(message: string, readonly stdout: string) {
    super(message);
    this.name = "TunnelStartupError";
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
    let buffer = "";
    let settled = false;

    const cleanupStartup = () => {
      clearTimeout(timer);
      process.stdout?.off("data", onData);
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
    const onData = (data: Uint8Array | string) => {
      buffer += data.toString();
      urlPattern.lastIndex = 0;
      const match = urlPattern.exec(buffer);
      if (match != null) {
        try {
          succeed(new URL(match[0]));
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
          process.kill();
        }
      }
    };
    const onClose = () => {
      fail(new TunnelStartupError("The tunnel URL is not found.", buffer));
      cleanupProcess();
    };
    const onError = (error: Error) => {
      fail(error);
    };
    const timer = setTimeout(() => {
      fail(
        new TunnelStartupError(
          `Timed out waiting for the tunnel URL after ${timeout} ms.`,
          buffer,
        ),
      );
      process.kill();
    }, timeout);

    process.stdout?.on("data", onData);
    process.on("close", onClose);
    process.on("error", onError);
  });
}
