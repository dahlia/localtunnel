<!-- deno-fmt-ignore-file -->

localtunnel
===========

This Deno module is a simple wrapper around the local tunneling services.
Currently it supports [localhost.run] and [serveo.net].  The module is designed
to be simple to use and to provide a consistent interface to both services.

[localhost.run]: https://localhost.run/
[serveo.net]: https://serveo.net/


Installation
------------

It is available on [JSR]:

~~~~ console
deno add @hongminhee/localtunnel
~~~~

[JSR]: https://jsr.io/@hongminhee/localtunnel


Usage
-----

Invoke the `openTunnel()` function to open a tunnel to a local port.
The function returns a promise that resolves to a `Tunnel` object.
The `Tunnel` object has a `url` property that contains the `URL` of the tunnel.
The `Tunnel` object also has a `close()` method that closes the tunnel:

~~~~ typescript
const tunnel = await openTunnel({ port: 8000 });
console.log(tunnel.url.href);
alert("Press Enter to close the tunnel.");
await tunnel.close();
~~~~
