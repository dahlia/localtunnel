/**
 * The service configuration.
 */
export interface Service {
  /**
   * The host of the service.
   */
  host: string;

  /**
   * The port of the service.
   */
  port: number;

  /**
   * The login name for the service, if any.
   */
  user?: string;

  /**
   * The URL pattern of the service, if any.
   */
  urlPattern: RegExp;
}

/**
 * The name of the service.
 */
export type ServiceName = "localhost.run" | "serveo.net";

/**
 * Available services.
 */
export const SERVICES: Record<ServiceName, Service> = {
  "localhost.run": {
    host: "localhost.run",
    port: 80,
    user: "nokey",
    urlPattern: /https:\/\/[a-f0-9]+\.lhr\.life/,
  } satisfies Service,
  "serveo.net": {
    host: "serveo.net",
    port: 80,
    urlPattern: /https:\/\/[a-f0-9]+.serveo.net/,
  } satisfies Service,
};

/**
 * Randomly chooses a service.
 * @returns The chosen service.
 */
export function chooseService(): Service {
  const services = Object.values(SERVICES);
  return services[Math.floor(Math.random() * services.length)];
}
