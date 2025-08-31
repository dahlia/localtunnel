<!-- deno-fmt-ignore-file -->

localtunnel
===========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

This package is a simple wrapper around the local tunneling services.
Currently it supports [localhost.run], [serveo.net], and [Pinggy].
The module is designed to be simple to use and to provide a consistent interface
to those services.

[JSR]: https://jsr.io/@hongminhee/localtunnel
[JSR badge]: https://jsr.io/badges/@hongminhee/localtunnel
[npm]: https://www.npmjs.com/package/@hongminhee/localtunnel
[npm badge]: https://img.shields.io/npm/v/@hongminhee/localtunnel?logo=npm
[localhost.run]: https://localhost.run/
[serveo.net]: https://serveo.net/
[Pinggy]: https://pinggy.io/


Installation
------------

It is available on [JSR] and [npm]:

~~~~ console
deno add --jsr @hongminhee/localtunnel  # Deno
npm  add       @hongminhee/localtunnel  # npm
pnpm add       @hongminhee/localtunnel  # pnpm
yarn add       @hongminhee/localtunnel  # Yarn
bun  add       @hongminhee/localtunnel  # Bun
~~~~


Usage
-----

Invoke the [`openTunnel()`] function to open a tunnel to a local port.
The function returns a promise that resolves to a [`Tunnel`] object.
The `Tunnel` object has a [`url`] property that contains the `URL` of the tunnel.
The `Tunnel` object also has a [`close()`] method that closes the tunnel:

~~~~ typescript
const tunnel = await openTunnel({ port: 8000 });
console.log(tunnel.url.href);
alert("Press Enter to close the tunnel.");
await tunnel.close();
~~~~

For more information, see the [API documentation][JSR].

[`openTunnel()`]: https://jsr.io/@hongminhee/localtunnel/doc/~/openTunnel
[`Tunnel`]: https://jsr.io/@hongminhee/localtunnel/doc/~/Tunnel
[`url`]: https://jsr.io/@hongminhee/localtunnel/doc/~/Tunnel.url
[`close()`]: https://jsr.io/@hongminhee/localtunnel/doc/~/Tunnel.close


Changelog
---------

### Version 0.4.0

To be released.

### Version 0.3.0

Released on August 31, 2025.

 -  Added support for Node.js and Bun.
 -  The package is now published on [npm] as well as [JSR].
 -  Every field in `Service`, `Tunnel`, and `TunnelOptions` is now `readonly`.
 -  Added `extraOptions` and `extraArgs` fields to the `Service` interface.
 -  Added `"pinggy.io"` to the `ServiceName` type.  [[#1]]

[#1]: https://github.com/dahlia/localtunnel/issues/1

### Version 0.2.0

Released on April 29, 2024.

 -  Added `exclude` option to `TunnelOptions` interface.
 -  Now `openTunnel()` automatically retries with another service if the first
    service fails.

### Version 0.1.1

Released on April 28, 2024.

 -  Fixed a bug in `openTunnel()` that breaks standard input on Windows.
 -  Improved error handling in `openTunnel()`.
 -  Added log messages using [LogTape].  The log category is `["localtunnel"]`.

[LogTape]: https://github.com/dahlia/logtape

### Version 0.1.0

Initial release.  Released on April 26, 2024.
