import { getLogger, type Logger } from "@logtape/logtape";
import { type ChildProcess, spawn } from "node:child_process";
import {
  chooseService,
  type Service,
  type ServiceName,
  SERVICES,
} from "./service.ts";

const logger: Logger = getLogger("localtunnel");

/**
 * Checks if `ssh` is installed on the system.
 * @returns `true` if `ssh` is installed, `false` otherwise.
 */
export async function isSshInstalled(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn("ssh", ["-V"], { stdio: "ignore" });
    child.on("close", (code) => {
      resolve(code === 0);
    });
    child.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * The tunnel options.
 */
export interface TunnelOptions {
  /**
   * The local port to expose.
   */
  port: number;

  /**
   * The service to use.  If not provided, a random service will be chosen.
   * If provided, the `exclude` option is ignored.
   */
  service?: Service | ServiceName;

  /**
   * The services to exclude from the random selection.  If the `service` option
   * is provided, this option is ignored.
   */
  exclude?: (ServiceName | Service)[];
}

/**
 * The opened tunnel.
 */
export interface Tunnel {
  /**
   * The public URL of the tunnel.
   */
  url: URL;

  /**
   * The local port being exposed.
   */
  localPort: number;

  /**
   * The process ID of the `ssh` process.
   */
  pid: number | undefined;

  /**
   * Closes the tunnel.
   */
  close(): Promise<void>;
}

/**
 * Opens a tunnel to the specified port.
 *
 * @example
 * ```typescript
 * const tunnel = await openTunnel({ port: 8000 });
 * console.log(tunnel.url.href);
 * alert("Press Enter to close the tunnel.");
 * await tunnel.close();
 * ```
 *
 * @param options The tunnel options.
 * @returns The public URL of the tunnel.
 * @throws {Error} If the `ssh` is not installed on the system.
 */
export async function openTunnel(options: TunnelOptions): Promise<Tunnel> {
  const sshInstalled = await isSshInstalled();
  if (!sshInstalled) {
    throw new Error("The ssh is not installed on the system.");
  }
  const service: Service = typeof options.service === "string"
    ? SERVICES[options.service]
    : options.service ?? chooseService(options.exclude);

  const args = [
    "-o",
    "StrictHostKeyChecking no",
    "-R",
    `${service.port}:localhost:${options.port}`,
    service.user == null ? service.host : `${service.user}@${service.host}`,
  ];

  logger.debug(
    "Spawning the ssh process: {command}",
    { command: { command: "ssh", args } },
  );

  return new Promise<Tunnel>((resolve, reject) => {
    const process = spawn("ssh", args, { stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let url: URL;
    let resolved = false;

    process.stdout?.on("data", (data: Uint8Array) => {
      buffer += data.toString();
      const match = service.urlPattern.exec(buffer);
      if (match != null && !resolved) {
        resolved = true;
        url = new URL(match[0]);
        logger.debug("The tunnel URL is found: {url}", { url: url.href });
        resolve({
          url,
          localPort: options.port,
          pid: process.pid,
          async close() {
            logger.debug("Closing the tunnel...");
            process.kill();
          },
        });
      }
    });

    process.on("close", (code) => {
      if (!resolved) {
        logger.error("The tunnel URL is not found: {stdout}", {
          stdout: buffer,
        });
        if (options.service != null) {
          reject(new Error("The tunnel URL is not found."));
        } else {
          resolve(openTunnel({
            ...options,
            exclude: [...(options.exclude ?? []), service],
          }));
        }
      }
    });

    process.on("error", (error) => {
      if (!resolved) {
        reject(error);
      }
    });
  });
}
