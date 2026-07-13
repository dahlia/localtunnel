import { getLogger, type Logger } from "@logtape/logtape";
import { spawn } from "node:child_process";
import { validateKnownHosts } from "./known_hosts.ts";
import { chooseServiceName, type Service, SERVICES } from "./service.ts";
import {
  DEFAULT_STARTUP_TIMEOUT,
  startTunnelProcess,
  TunnelSetupError,
  TunnelStartupError,
  validateStartupTimeout,
} from "./tunnel_process.ts";

export { type Service, SERVICES } from "./service.ts";

type ServiceRegistry = Readonly<Record<string, Service>>;

type ServiceRegistryShape<TServices> = {
  readonly [TName in keyof TServices]-?: Service;
};

type ServiceName<TServices> = Extract<
  keyof TServices,
  string
>;

interface RuntimeTunnelOptions {
  readonly port: number;
  readonly services?: object;
  readonly service?: string;
  readonly exclude?: readonly string[];
  readonly startupTimeout?: number;
}

interface BaseTunnelOptions<
  TServices extends ServiceRegistryShape<TServices>,
> {
  /**
   * The local port to expose.
   */
  readonly port: number;

  /**
   * The name of the service to use.  If not provided, a random service will be
   * chosen.  If provided, the `exclude` option is ignored.
   */
  readonly service?: ServiceName<TServices>;

  /**
   * The service names to exclude from the random selection.  If the `service`
   * option is provided, this option is ignored.
   */
  readonly exclude?: readonly ServiceName<TServices>[];

  /**
   * The maximum number of milliseconds to wait for a service to provide a
   * tunnel URL.  It must be between 0 and 2,147,483,647 milliseconds.  If
   * omitted, the default is 10 seconds.
   */
  readonly startupTimeout?: number;
}

interface DefaultServicesOption {
  /**
   * The services to use.  If not provided, {@link SERVICES} will be used.
   */
  readonly services?: typeof SERVICES;
}

interface CustomServicesOption<
  TServices extends ServiceRegistryShape<TServices>,
> {
  /**
   * The services to use instead of {@link SERVICES}.
   */
  readonly services: TServices;
}

const logger: Logger = getLogger("localtunnel");

/**
 * Checks if `ssh` is installed on the system.
 * @returns `true` if `ssh` is installed, `false` otherwise.
 */
export function isSshInstalled(): Promise<boolean> {
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
 * The tunnel options using the default {@link SERVICES} registry.
 */
export type TunnelOptions =
  & BaseTunnelOptions<typeof SERVICES>
  & DefaultServicesOption;

/**
 * The tunnel options using a custom service registry.
 */
export type CustomTunnelOptions<
  TServices extends ServiceRegistryShape<TServices>,
> =
  & BaseTunnelOptions<TServices>
  & CustomServicesOption<TServices>;

/**
 * The opened tunnel.
 */
export interface Tunnel {
  /**
   * The public URL of the tunnel.
   */
  readonly url: URL;

  /**
   * The local port being exposed.
   */
  readonly localPort: number;

  /**
   * The process ID of the `ssh` process.
   */
  readonly pid: number | undefined;

  /**
   * Closes the tunnel and resolves after the SSH process and its temporary
   * resources have been cleaned up.
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
export function openTunnel(
  options: TunnelOptions,
): Promise<Tunnel>;
export function openTunnel<
  const TServices extends ServiceRegistryShape<TServices>,
>(
  options: CustomTunnelOptions<TServices>,
): Promise<Tunnel>;
export function openTunnel(options: RuntimeTunnelOptions): Promise<Tunnel> {
  return openTunnelWithServices(options);
}

async function openTunnelWithServices(
  options: RuntimeTunnelOptions,
): Promise<Tunnel> {
  const services = (options.services ?? SERVICES) as ServiceRegistry;
  const serviceName = options.service ??
    chooseServiceName(services, options.exclude);
  if (!Object.hasOwn(services, serviceName)) {
    throw new Error(`Unknown service: ${serviceName}.`);
  }
  const service = services[serviceName];
  if (service == null) {
    throw new Error(`Unknown service: ${serviceName}.`);
  }
  const startupTimeout = options.startupTimeout ?? DEFAULT_STARTUP_TIMEOUT;
  validateStartupTimeout(startupTimeout);
  if (service.knownHosts != null) validateKnownHosts(service.knownHosts);
  const sshInstalled = await isSshInstalled();
  if (!sshInstalled) {
    throw new Error("The ssh is not installed on the system.");
  }

  try {
    const tunnelProcess = await startTunnelProcess(
      service,
      options.port,
      startupTimeout,
    );
    logger.debug("The tunnel URL is found: {url}", {
      url: tunnelProcess.url.href,
    });
    return {
      url: tunnelProcess.url,
      localPort: options.port,
      pid: tunnelProcess.pid,
      close: tunnelProcess.close,
    };
  } catch (error) {
    if (error instanceof TunnelSetupError) throw error.cause;
    const reason = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to open a tunnel with {service}: {error}", {
      service: serviceName,
      error: reason,
      stdout: reason instanceof TunnelStartupError ? reason.stdout : "",
      stderr: reason instanceof TunnelStartupError ? reason.stderr : "",
    });
    if (options.service != null) throw reason;
    return await openTunnelWithServices({
      ...options,
      services,
      exclude: [...(options.exclude ?? []), serviceName],
    });
  }
}
