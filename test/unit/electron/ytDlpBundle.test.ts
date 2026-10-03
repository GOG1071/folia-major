import { describe, expect, it } from "vitest";
import {
  YTDLP_ASSETS,
  YTDLP_RELEASE_TAG,
  resolveYtDlpAsset,
} from "../../../packaging/yt-dlp/fetch-yt-dlp.mjs";

// test/unit/electron/ytDlpBundle.test.ts
// Locks the yt-dlp release/target mapping without performing network access in unit tests.

describe("bundled yt-dlp manifest", () => {
  it("pins the release tag and a sha256 for every asset", () => {
    expect(YTDLP_RELEASE_TAG).toBe("2026.08.19");
    for (const entry of Object.values(YTDLP_ASSETS)) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it.each([
    ["win32", "x64", "win-x64", "yt-dlp.exe", "yt-dlp.exe"],
    ["linux", "x64", "linux-x64", "yt-dlp", "yt-dlp_linux"],
    ["linux", "arm64", "linux-arm64", "yt-dlp", "yt-dlp_linux_aarch64"],
    ["darwin", "x64", "mac-x64", "yt-dlp", "yt-dlp_macos"],
    ["darwin", "arm64", "mac-arm64", "yt-dlp", "yt-dlp_macos"],
  ])("maps %s/%s to %s", (platform, arch, key, binaryName, asset) => {
    expect(resolveYtDlpAsset(platform, arch)).toMatchObject({
      key,
      binaryName,
      asset,
    });
  });

  it("fails instead of silently bundling a binary for the wrong architecture", () => {
    expect(() => resolveYtDlpAsset("win32", "arm64")).toThrow(
      "No bundled yt-dlp release",
    );
  });
});
