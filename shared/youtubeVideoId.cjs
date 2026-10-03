"use strict";

// shared/youtubeVideoId.cjs
// Pure YouTube URL parser for the Electron main process. The renderer keeps an equivalent copy in
// src/utils/youtube/youtubeVideoId.ts; test/unit/youtube/youtubeVideoId.test.ts pins both to one table.

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_INPUT_LENGTH = 2048;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "www.youtube-nocookie.com",
]);
const SHORT_HOST = "youtu.be";
const PATH_PREFIXES = new Set(["shorts", "embed", "live"]);

/** Extracts the 11-char video id from a supported YouTube URL, or null for anything else. */
function parseYoutubeVideoId(input) {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text || text.length > MAX_INPUT_LENGTH || /\s/.test(text)) return null;

  let url;
  try {
    // Pasted links often lack the scheme ("youtu.be/<id>"); bare ids stay rejected on purpose.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let candidate = null;
  if (host === SHORT_HOST) {
    candidate = segments[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") candidate = url.searchParams.get("v");
    else if (PATH_PREFIXES.has(segments[0])) candidate = segments[1] ?? null;
  }
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/** The only URL form ever handed to yt-dlp. */
function buildCanonicalYoutubeUrl(videoId) {
  if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error("Invalid YouTube video id");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

module.exports = { VIDEO_ID_PATTERN, parseYoutubeVideoId, buildCanonicalYoutubeUrl };
