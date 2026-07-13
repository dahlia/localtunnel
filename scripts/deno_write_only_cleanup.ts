import { createKnownHostsFile } from "../src/known_hosts.ts";

const knownHostsFile = await createKnownHostsFile({
  "example.com": ["ssh-ed25519 AAAAwriteonly"],
});
await knownHostsFile.cleanup();
