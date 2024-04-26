import { chooseService, Service, ServiceName, SERVICES } from "./service.ts";

/**
 * Checks if `ssh` is installed on the system.
 * @returns `true` if `ssh` is installed, `false` otherwise.
 */
export async function isSshInstalled(): Promise<boolean> {
  const cmd = new Deno.Command("ssh", {
    args: ["-V"],
    stderr: "null",
    stdout: "null",
    stdin: "null",
  });
  const { success } = await cmd.output();
  return success;
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
   */
  service?: Service | ServiceName;
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
  pid: number;

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
    : options.service ?? chooseService();
  const cmd = new Deno.Command("ssh", {
    args: [
      "-o",
      "StrictHostKeyChecking no",
      "-R",
      `${service.port}:localhost:${options.port}`,
      service.user == null ? service.host : `${service.user}@${service.host}`,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "null",
  });
  const process = await cmd.spawn();
  const reader = process.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let url: URL;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      process.kill();
      throw new Error("The tunnel URL is not found.");
    }
    buffer += decoder.decode(value);
    const match = service.urlPattern.exec(buffer);
    if (match != null) {
      url = new URL(match[0]);
      break;
    }
  }
  return {
    url,
    localPort: options.port,
    pid: process.pid,
    close() {
      process.kill();
      return Promise.resolve();
    },
  };
}
