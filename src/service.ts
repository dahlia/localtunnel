/**
 * The service configuration.
 */
export interface Service {
  /**
   * The host of the service.
   */
  readonly host: string;

  /**
   * The port of the service.
   */
  readonly port: number;

  /**
   * The login name for the service, if any.
   */
  readonly user?: string;

  /**
   * The URL pattern of the service, if any.
   */
  readonly urlPattern: RegExp;

  /**
   * Extra options for the `ssh` command, if any.
   * @since 0.3.0
   */
  readonly extraOptions?: readonly string[];

  /**
   * Extra arguments for the `ssh` command, if any.
   * @since 0.3.0
   */
  readonly extraArgs?: readonly string[];
}

/**
 * Available services.
 */
type BuiltInServiceName = "serveo.net" | "pinggy.io";

export const SERVICES: Readonly<Record<BuiltInServiceName, Service>> = {
  "serveo.net": {
    host: "serveo.net",
    port: 80,
    urlPattern: /https:\/\/[a-z0-9-]+\.(?:serveo\.net|serveousercontent\.com)/,
  },
  "pinggy.io": {
    host: "free.pinggy.io:443",
    port: 0,
    urlPattern:
      /https:\/\/[a-z0-9-]+\.(?:free\.pinggy\.net|run\.pinggy-free\.link)/,
    extraOptions: ["-o", "ServerAliveInterval=30", "-t"],
    extraArgs: ["x:xff"],
  },
};

type ServiceRegistry = Readonly<Record<string, Service>>;

type ServiceName<TServices extends ServiceRegistry> = Extract<
  keyof TServices,
  string
>;

/**
 * Randomly chooses a service name.
 * @param services The available services.
 * @param exclude The service names to exclude.
 * @returns The chosen service name.
 * @throws {Error} If no available services.
 */
export function chooseServiceName<TServices extends ServiceRegistry>(
  services: TServices,
  exclude: readonly ServiceName<TServices>[] = [],
): ServiceName<TServices> {
  const excluded = new Set<string>(exclude);
  const serviceNames = Object.keys(services).filter((serviceName) =>
    !excluded.has(serviceName)
  ) as ServiceName<TServices>[];
  if (serviceNames.length < 1) {
    throw new Error("No available services.");
  }
  return serviceNames[Math.floor(Math.random() * serviceNames.length)];
}
