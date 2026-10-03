import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// packaging/yt-dlp/fetch-yt-dlp.mjs
// Downloads one pinned official yt-dlp release binary for the Electron target and stages it
// for electron-builder's extraResources (single standalone file, no archive extraction).

export const YTDLP_RELEASE_TAG = "2026.08.19";
const RELEASE_BASE_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_RELEASE_TAG}`;

// sha256 values come from the release's SHA2-256SUMS. mac-x64 and mac-arm64 share the
// universal `yt-dlp_macos` binary.
export const YTDLP_ASSETS = Object.freeze({
  "linux-x64": {
    asset: "yt-dlp_linux",
    sha256: "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a",
  },
  "linux-arm64": {
    asset: "yt-dlp_linux_aarch64",
    sha256: "b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc",
  },
  "mac-x64": {
    asset: "yt-dlp_macos",
    sha256: "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202",
  },
  "mac-arm64": {
    asset: "yt-dlp_macos",
    sha256: "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202",
  },
  "win-x64": {
    asset: "yt-dlp.exe",
    sha256: "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
  },
});

const PLATFORM_NAMES = Object.freeze({
  darwin: "mac",
  linux: "linux",
  win32: "win",
});

/** Maps a Node platform/arch pair to its pinned release asset; throws when none is bundled. */
export function resolveYtDlpAsset(platform, arch) {
  const osName = PLATFORM_NAMES[platform] ?? platform;
  const key = `${osName}-${arch}`;
  const entry = YTDLP_ASSETS[key];
  if (!entry) throw new Error(`No bundled yt-dlp release for ${platform}/${arch}`);
  return {
    ...entry,
    key,
    osName,
    binaryName: osName === "win" ? "yt-dlp.exe" : "yt-dlp",
  };
}

const sha256File = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

const download = async (url, destination) => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok)
    throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
};

/** Prepares the per-target directory consumed by the extraResources FileSet. */
export async function prepareBundledYtDlp({
  platform = process.platform,
  arch = process.arch,
  outputRoot = path.resolve("build", "yt-dlp"),
} = {}) {
  const entry = resolveYtDlpAsset(platform, arch);
  if (!/^[a-f0-9]{64}$/.test(entry.sha256)) {
    throw new Error(`yt-dlp checksum is not pinned for ${entry.key}`);
  }

  const targetDir = path.join(outputRoot, entry.key);
  const targetBinary = path.join(targetDir, entry.binaryName);
  const markerPrefix = `Release: ${YTDLP_RELEASE_TAG}\nAsset: ${entry.asset}\nSHA-256: ${entry.sha256}\n`;
  try {
    const cachedMarker = await readFile(
      path.join(targetDir, "BUNDLE-INFO.txt"),
      "utf8",
    );
    if (
      cachedMarker === markerPrefix &&
      (await sha256File(targetBinary)) === entry.sha256
    )
      return targetDir;
  } catch {
    // Missing/stale output is rebuilt below.
  }

  await mkdir(outputRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "folia-yt-dlp-"));
  try {
    const downloaded = path.join(temporaryRoot, entry.asset);
    await download(`${RELEASE_BASE_URL}/${entry.asset}`, downloaded);
    const actualSha256 = await sha256File(downloaded);
    if (actualSha256 !== entry.sha256) {
      throw new Error(
        `Checksum mismatch for ${entry.asset}: expected ${entry.sha256}, got ${actualSha256}`,
      );
    }

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await copyFile(downloaded, targetBinary);
    await chmod(targetBinary, 0o755);
    // Written last so a failed copy can never be accepted as a valid cache hit.
    await writeFile(path.join(targetDir, "BUNDLE-INFO.txt"), markerPrefix);
    return targetDir;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  prepareBundledYtDlp().then(
    (output) => console.log(`[yt-dlp] prepared ${output}`),
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
