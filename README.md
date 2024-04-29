<!-- deno-fmt-ignore-file -->

localtunnel
===========

[![JSR][JSR badge]][JSR]

This Deno module is a simple wrapper around the local tunneling services.
Currently it supports [localhost.run] and [serveo.net].  The module is designed
to be simple to use and to provide a consistent interface to both services.

[JSR]: https://jsr.io/@hongminhee/localtunnel
[JSR badge]: https://jsr.io/badges/@hongminhee/localtunnel
[localhost.run]: https://localhost.run/
[serveo.net]: https://serveo.net/


Installation
------------

It is available on [JSR]:

~~~~ console
deno add @hongminhee/localtunnel
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

### Version 0.3.0

To be released.

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
