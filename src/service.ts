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

  /**
   * Trusted SSH host public keys, grouped by OpenSSH `known_hosts` host
   * pattern.  Use `[hostname]:port` for a service on a nonstandard SSH port.
   * Multiple keys can be supplied for staged key rotation or different host
   * key algorithms.
   * @since 0.5.0
   */
  readonly knownHosts?: Readonly<Record<string, readonly string[]>>;
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
    knownHosts: {
      // RSA SHA256:07jcXlJ4SkBnyTmaVnmTpXuBiRx2+Q2adxbttO9gt0M
      // Verified on July 13, 2026.
      "serveo.net": [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDxYGqSKVwJpQD1F0YIhz+bd5lpl7YesKjtrn1QD1RjQcSj724lJdCwlv4J8PcLuFFtlAA8AbGQju7qWdMN9ihdHvRcWf0tSjZ+bzwYkxaCydq4JnCrbvLJPwLFaqV1NdcOzY2NVLuX5CfY8VTHrps49LnO0QpGaavqrbk+wTWDD9MHklNfJ1zSFpQAkSQnSNSYi/M2J3hX7P0G2R7dsUvNov+UgNKpc4n9+Lq5Vmcqjqo2KhFyHP0NseDLpgjaqGJq2Kvit3QowhqZkK4K77AA65CxZjdDfpjwZSuX075F9vNi0IFpFkGJW9KlrXzI4lIzSAjPZBURhUb8nZSiPuzj",
      ],
    },
  },
  "pinggy.io": {
    host: "free.pinggy.io:443",
    port: 0,
    urlPattern:
      /https:\/\/[a-z0-9-]+\.(?:free\.pinggy\.net|run\.pinggy-free\.link)/,
    extraOptions: ["-o", "ServerAliveInterval=30", "-t"],
    extraArgs: ["x:xff"],
    knownHosts: {
      // RSA SHA256:nFd5rfJMGuZXvfeRzJ/BtT3TfksAxTWMajcrHRcI7AM
      // Verified on July 13, 2026.
      "[free.pinggy.io]:443": [
        "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDF0YJigZJU62vn4rsKGRjIRTtMe/suc3d4YDe0iIvFzLMuaN78oxhWn9Uqefe1gN++dYVssspsgsvTXTTBcxxo3WoFeNr1z/+osJ45+Yxoa0pbaJdAwbr8CqjDa96r9/AhAXHoKncAByEOSiXfdWCXf84YC+Hu48/gZOqSZ3VqPz+nNGFByJcqYJ+jSELSqCNWVLWFxx7vH270Kymw2XkdOW47zzDNO7X4uByxHfaZMgI6phoaNglGizM0VNMQPL5GbspVGejFQE85QJbX3oF8vuCYnM+OMkwopHG+muh6Tro8+fm6G/fcmu34YJNbU3oaTdW1YPqvcKFX1AuIY9CA5lLZR9A1rOJ+fd4JEYaoTxwUN2ZPcrf7JEnvHmcV9hmupTSllJzLk4smDpl5PSknDm68/h/z/ZmaDlunGsHnn397fwCwS7sO9Q1yIuZ+Bri0td7+N2EK1mvM/qsnrSauOymcmqYVy6TLiejHdoVl8+lKqatkTxyFf/3MP8ylCKSoP0SJZratcU1n+0EciG+IjEzdPZ/1tuJZhBWqOUbYfUl+WgovH+J+AQKtoNzPP+fLtLNcmLEhx99N2y5l7A8IOlyy41Minq4N7V5X8Q7QHhEoocatNNn5JRYe/25P9aQelF0ItMD0PEmf8rIHWMqbwnwQ8pVVdDhE6mwhDskBIw==",
      ],
    },
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
