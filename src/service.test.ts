import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  type CustomTunnelOptions,
  openTunnel,
  type Service,
  SERVICES,
  type TunnelOptions,
} from "./index.ts";
import { chooseServiceName } from "./service.ts";
import { test } from "./test_runner.ts";

const CUSTOM_SERVICES = {
  custom: {
    host: "tunnel.example.com",
    port: 80,
    urlPattern: /https:\/\/[^\s]+\.example\.com/,
  },
  serveo: SERVICES["serveo.net"],
} satisfies Readonly<Record<string, Service>>;

const SAME_SHAPE_SERVICES: Readonly<
  Record<keyof typeof SERVICES, Service>
> = {
  "serveo.net": CUSTOM_SERVICES.custom,
  "pinggy.io": CUSTOM_SERVICES.custom,
};

interface InterfaceServices {
  foo: Service;
}

const INTERFACE_SERVICES: InterfaceServices = {
  foo: CUSTOM_SERVICES.custom,
};

test("chooseServiceName chooses from a custom registry", () => {
  const services = { custom: CUSTOM_SERVICES.custom };

  assert.equal(chooseServiceName(services), "custom");
});

test("chooseServiceName excludes services by name", () => {
  assert.equal(
    chooseServiceName(CUSTOM_SERVICES, ["custom"]),
    "serveo",
  );
});

test("chooseServiceName rejects an empty or exhausted registry", () => {
  assert.throws(
    () => chooseServiceName({}),
    { message: "No available services." },
  );
  assert.throws(
    () => chooseServiceName(CUSTOM_SERVICES, ["custom", "serveo"]),
    { message: "No available services." },
  );
});

test("the Serveo service recognizes current tunnel URLs", () => {
  assert.match(
    "https://example-123.serveousercontent.com",
    SERVICES["serveo.net"].urlPattern,
  );
  assert.match(
    "https://example123.serveo.net",
    SERVICES["serveo.net"].urlPattern,
  );
});

test("the built-in services pin their current SSH host keys", () => {
  const fingerprints = Object.fromEntries(
    Object.entries(SERVICES).map(([name, service]) => {
      assert.ok(service.knownHosts);
      const keys = Object.values(service.knownHosts).flat();
      assert.equal(keys.length, 1);
      const encodedKey = keys[0].split(/\s+/, 2)[1];
      const fingerprint = createHash("sha256")
        .update(Buffer.from(encodedKey, "base64"))
        .digest("base64")
        .replace(/=+$/, "");
      return [name, `SHA256:${fingerprint}`];
    }),
  );

  assert.deepEqual(fingerprints, {
    "serveo.net": "SHA256:07jcXlJ4SkBnyTmaVnmTpXuBiRx2+Q2adxbttO9gt0M",
    "pinggy.io": "SHA256:nFd5rfJMGuZXvfeRzJ/BtT3TfksAxTWMajcrHRcI7AM",
  });
  assert.ok(Object.hasOwn(SERVICES["serveo.net"].knownHosts!, "serveo.net"));
  assert.ok(
    Object.hasOwn(
      SERVICES["pinggy.io"].knownHosts!,
      "[free.pinggy.io]:443",
    ),
  );
});

test("openTunnel rejects empty known-host key arrays before invoking SSH", async () => {
  await assert.rejects(
    openTunnel({
      port: 8000,
      services: {
        invalid: {
          host: "tunnel.example.com",
          port: 80,
          urlPattern: /example/,
          knownHosts: { "tunnel.example.com": [] },
        },
      },
      service: "invalid",
    }),
    { name: "TypeError", message: /at least one public key/ },
  );
});

test("openTunnel rejects an unknown service name", async () => {
  await assert.rejects(
    openTunnel({
      port: 8000,
      service: "unknown",
    } as unknown as TunnelOptions),
    { message: "Unknown service: unknown." },
  );
});

// Compile-time coverage for the service-name inference of the public API.
if (false) {
  const defaultOptions: TunnelOptions = {
    port: 8000,
    service: "serveo.net",
    startupTimeout: 5_000,
  };
  const customOptions: CustomTunnelOptions<typeof CUSTOM_SERVICES> = {
    port: 8000,
    services: CUSTOM_SERVICES,
    service: "custom",
    exclude: ["serveo"],
  };
  const sameShapeOptions: CustomTunnelOptions<typeof SAME_SHAPE_SERVICES> = {
    port: 8000,
    services: SAME_SHAPE_SERVICES,
    service: "serveo.net",
  };
  const interfaceOptions: CustomTunnelOptions<InterfaceServices> = {
    port: 8000,
    services: INTERFACE_SERVICES,
    service: "foo",
  };
  // @ts-expect-error A custom TunnelOptions type requires its registry.
  const missingServices: CustomTunnelOptions<typeof CUSTOM_SERVICES> = {
    port: 8000,
    service: "custom",
  };
  // @ts-expect-error A default-shaped custom registry is still required.
  const missingSameShapeServices: CustomTunnelOptions<
    typeof SAME_SHAPE_SERVICES
  > = {
    port: 8000,
    service: "serveo.net",
  };
  openTunnel(defaultOptions);
  openTunnel(customOptions);
  openTunnel(sameShapeOptions);
  openTunnel(interfaceOptions);
  openTunnel(missingServices);
  openTunnel(missingSameShapeServices);
  openTunnel({
    port: 8000,
    services: CUSTOM_SERVICES,
    service: "serveo",
    exclude: ["custom"],
  });
  openTunnel({
    port: 8000,
    services: INTERFACE_SERVICES,
    service: "foo",
  });

  const openCustomTunnel = <
    TServices extends { readonly [TName in keyof TServices]-?: Service },
  >(
    services: TServices,
    service: Extract<keyof TServices, string>,
    exclude?: readonly Extract<keyof TServices, string>[],
  ) => {
    const options: CustomTunnelOptions<TServices> = {
      port: 8000,
      services,
      service,
      exclude,
    };
    return openTunnel(options);
  };
  openCustomTunnel(CUSTOM_SERVICES, "custom", ["serveo"]);

  // @ts-expect-error Custom names require the matching services registry.
  openTunnel({ port: 8000, service: "custom" });
  // @ts-expect-error Default service names are absent from this registry.
  openTunnel({
    port: 8000,
    services: CUSTOM_SERVICES,
    service: "serveo.net",
  });
  // @ts-expect-error Exclusions must be keys of the selected registry.
  openTunnel({ port: 8000, services: CUSTOM_SERVICES, exclude: ["missing"] });
  // @ts-expect-error Services are selected by name, not by object.
  openTunnel({ port: 8000, service: SERVICES["serveo.net"] });
  // @ts-expect-error Exclusions are service names, not service objects.
  openTunnel({ port: 8000, exclude: [SERVICES["serveo.net"]] });
}
