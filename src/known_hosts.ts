import { randomUUID } from "node:crypto";
import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";

export type KnownHosts = Readonly<Record<string, readonly string[]>>;

export interface KnownHostsFile {
  readonly directory: string;
  readonly path: string;
  cleanup(): Promise<void>;
}

async function createTemporaryDirectory(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const directory = join(tmpdir(), `localtunnel-${randomUUID()}`);
    try {
      await mkdir(directory, { mode: 0o700 });
      return directory;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "EEXIST") throw error;
    }
  }
  throw new Error("Failed to create a unique temporary directory.");
}

async function removeKnownHostsFile(
  path: string,
  directory: string,
): Promise<void> {
  let fileError: unknown;
  try {
    await unlink(path);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") fileError = error;
  }

  try {
    await rmdir(directory);
  } catch (directoryError) {
    if (fileError != null) {
      throw new AggregateError(
        [fileError, directoryError],
        "Failed to remove the temporary known_hosts file and directory.",
      );
    }
    throw directoryError;
  }
  if (fileError != null) throw fileError;
}

export function validateKnownHosts(knownHosts: KnownHosts): void {
  const entries = Object.entries(knownHosts);
  if (entries.length < 1) {
    throw new TypeError(
      "The knownHosts map must contain at least one host pattern.",
    );
  }

  for (const [hostPattern, publicKeys] of entries) {
    if (hostPattern.trim().length < 1 || /[\r\n]/.test(hostPattern)) {
      throw new TypeError(
        "Each knownHosts host pattern must be a non-empty single line.",
      );
    }
    if (!Array.isArray(publicKeys) || publicKeys.length < 1) {
      throw new TypeError(
        `The knownHosts entry for ${
          JSON.stringify(hostPattern)
        } must contain at least one public key.`,
      );
    }
    for (const publicKey of publicKeys) {
      if (publicKey.trim().length < 1 || /[\r\n]/.test(publicKey)) {
        throw new TypeError(
          `Each public key for ${
            JSON.stringify(hostPattern)
          } must be a non-empty single line.`,
        );
      }
    }
  }
}

export function serializeKnownHosts(knownHosts: KnownHosts): string {
  validateKnownHosts(knownHosts);
  const lines: string[] = [];
  for (const [hostPattern, publicKeys] of Object.entries(knownHosts)) {
    for (const publicKey of publicKeys) {
      lines.push(`${hostPattern} ${publicKey}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function formatSshConfigPath(
  path: string,
  operatingSystem: string = platform,
): string {
  const normalized = operatingSystem === "win32"
    ? path.replaceAll("\\", "/")
    : path;
  const escaped = normalized.replaceAll("%", "%%").replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  return `"${escaped}"`;
}

export async function createKnownHostsFile(
  knownHosts: KnownHosts,
): Promise<KnownHostsFile> {
  const contents = serializeKnownHosts(knownHosts);
  const directory = await createTemporaryDirectory();
  const path = join(directory, "known_hosts");
  try {
    await writeFile(path, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    try {
      await removeKnownHostsFile(path, directory);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Failed to create and clean up the temporary known_hosts file.",
      );
    }
    throw error;
  }

  let cleanupPromise: Promise<void> | undefined;
  return {
    directory,
    path,
    cleanup() {
      cleanupPromise ??= removeKnownHostsFile(path, directory);
      return cleanupPromise;
    },
  };
}
