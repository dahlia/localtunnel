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
 * @param exclude The services to exclude.
 * @returns The chosen service.
 * @throws {Error} If no available services.
 */
export function chooseService(exclude?: (Service | ServiceName)[]): Service {
  const excludeServices = (exclude ?? []).map((service) =>
    typeof service === "string" ? SERVICES[service] : service
  );
  const services = Object.values(SERVICES)
    .filter((service) => {
      return !excludeServices.some((excludeService) =>
        doServicesEqual(service, excludeService)
      );
    });
  if (services.length < 1) {
    throw new Error("No available services.");
  }
  return services[Math.floor(Math.random() * services.length)];
}

/**
 * Checks if two services are equal.
 * @param a A service.
 * @param b Another service.
 * @returns `true` if the services are equal, `false` otherwise.
 */
export function doServicesEqual(a: Service, b: Service): boolean {
  return a.host === b.host && a.port === b.port && a.user === b.user &&
    a.urlPattern === b.urlPattern;
}
