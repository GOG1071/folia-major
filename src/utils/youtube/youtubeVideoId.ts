// src/utils/youtube/youtubeVideoId.ts
// Renderer-side YouTube URL parser. Mirrors shared/youtubeVideoId.cjs (the Electron main-process
// copy); test/unit/youtube/youtubeVideoId.test.ts runs one case table against both.

export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const MAX_INPUT_LENGTH = 2048;
const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'www.youtube-nocookie.com',
]);
const SHORT_HOST = 'youtu.be';
const PATH_PREFIXES = new Set(['shorts', 'embed', 'live']);

/** Extracts the 11-char video id from a supported YouTube URL, or null for anything else. */
export const parseYoutubeVideoId = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    const text = input.trim();
    if (!text || text.length > MAX_INPUT_LENGTH || /\s/.test(text)) return null;

    let url: URL;
    try {
        // Pasted links often lack the scheme ("youtu.be/<id>"); bare ids stay rejected on purpose.
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    let candidate: string | null = null;
    if (host === SHORT_HOST) {
        candidate = segments[0] ?? null;
    } else if (YOUTUBE_HOSTS.has(host)) {
        if (segments[0] === 'watch') candidate = url.searchParams.get('v');
        else if (PATH_PREFIXES.has(segments[0])) candidate = segments[1] ?? null;
    }
    return candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
};
