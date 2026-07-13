import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { platform } from "node:process";
import {
  createKnownHostsFile,
  formatSshConfigPath,
  serializeKnownHosts,
  validateKnownHosts,
} from "./known_hosts.ts";
import { test } from "./test_runner.ts";

test("serializeKnownHosts writes every key on its own line", () => {
  assert.equal(
    serializeKnownHosts({
      "example.com": [
        "ssh-ed25519 AAAAfirst",
        "ssh-rsa AAAAsecond comment",
      ],
      "[example.net]:2222": ["ecdsa-sha2-nistp256 AAAAthird"],
    }),
    [
      "example.com ssh-ed25519 AAAAfirst",
      "example.com ssh-rsa AAAAsecond comment",
      "[example.net]:2222 ecdsa-sha2-nistp256 AAAAthird",
      "",
    ].join("\n"),
  );
});

test("validateKnownHosts rejects empty and multiline entries", () => {
  assert.throws(
    () => validateKnownHosts({}),
    { name: "TypeError", message: /at least one host pattern/ },
  );
  assert.throws(
    () => validateKnownHosts({ "example.com": [] }),
    { name: "TypeError", message: /at least one public key/ },
  );
  assert.throws(
    () => validateKnownHosts({ "": ["ssh-ed25519 AAAA"] }),
    { name: "TypeError", message: /host pattern/ },
  );
  assert.throws(
    () => validateKnownHosts({ "example.com": [""] }),
    { name: "TypeError", message: /public key/ },
  );
  assert.throws(
    () =>
      validateKnownHosts({
        "example.com\nattacker.example": ["ssh-ed25519 AAAA"],
      }),
    { name: "TypeError", message: /host pattern/ },
  );
  assert.throws(
    () =>
      validateKnownHosts({
        "example.com": ["ssh-ed25519 AAAA\nattacker.example ssh-rsa BBBB"],
      }),
    { name: "TypeError", message: /public key/ },
  );
});

test("createKnownHostsFile creates a private file and cleans it up", async () => {
  const knownHostsFile = await createKnownHostsFile({
    "example.com": ["ssh-ed25519 AAAAfirst"],
  });

  assert.equal(
    await readFile(knownHostsFile.path, "utf8"),
    "example.com ssh-ed25519 AAAAfirst\n",
  );
  if (platform !== "win32") {
    assert.equal((await stat(knownHostsFile.directory)).mode & 0o777, 0o700);
    assert.equal((await stat(knownHostsFile.path)).mode & 0o777, 0o600);
  }

  await knownHostsFile.cleanup();
  await knownHostsFile.cleanup();
  await assert.rejects(stat(knownHostsFile.directory), { code: "ENOENT" });
});

test("formatSshConfigPath quotes spaces and normalizes Windows paths", () => {
  assert.equal(
    formatSshConfigPath('/tmp/%h/local tunnel/known"hosts', "linux"),
    '"/tmp/%%h/local tunnel/known\\"hosts"',
  );
  assert.equal(
    formatSshConfigPath(
      "C:\\Users\\100% Real User\\AppData\\Local\\known_hosts",
      "win32",
    ),
    '"C:/Users/100%% Real User/AppData/Local/known_hosts"',
  );
});
