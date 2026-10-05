import type { LyricData, SongResult } from '../../../types';
import { detectTimedLyricFormat } from '../formatDetection';
import { parseLyricsByFormat } from '../parserCore';
import { hasRenderableLyrics } from '../validity';

// src/utils/lyrics/providers/lrclibLyricProvider.ts
// LRCLIB (https://lrclib.net) lyric source: a lyrics-only community database, not an Omni music provider.
// It is called straight from the renderer (the API answers every origin with `access-control-allow-origin: *`),
// so there is no proxy hop. Only line-synced lyrics are used: the app has no unsynced-lyrics renderer, and
// `lyricsfile` word timings are YAML that would need a new dependency.

const LRCLIB_API_BASE = 'https://lrclib.net/api';
// LRCLIB asks every client to identify itself. A browser cannot set User-Agent, so the documented
// `Lrclib-Client` header carries it; the API's CORS preflight lists it in access-control-allow-headers.
const LRCLIB_CLIENT_HEADER_VALUE = 'Folia (https://github.com/chthollyphile/folia-major)';
const REQUEST_TIMEOUT_MS = 6000;
const DEFAULT_RETRY_AFTER_MS = 30_000;
const MAX_RETRY_AFTER_MS = 10 * 60_000;
const CACHE_LIMIT = 200;
// /api/search never returns more than 20 records.
const SEARCH_RESULT_CAP = 20;

export interface LrclibRecord {
    id: number;
    name?: string | null;
    trackName?: string | null;
    artistName?: string | null;
    albumName?: string | null;
    /** Seconds, fractional. */
    duration?: number | null;
    instrumental?: boolean | null;
    hasWordSync?: boolean | null;
    plainLyrics?: string | null;
    syncedLyrics?: string | null;
}

export interface LrclibLyricsResult {
    lyrics: LyricData | null;
    isPureMusic: boolean;
}

export interface LrclibLookupTarget {
    title: string;
    artist: string;
    durationMs: number;
}

/** Thrown while LRCLIB is asking clients to back off (HTTP 429); no request is sent until the window ends. */
export class LrclibRateLimitError extends Error {
    readonly retryAfterMs: number;

    constructor(retryAfterMs: number) {
        super(`LRCLIB rate limit: retry in ${Math.ceil(retryAfterMs / 1000)}s`);
        this.name = 'LrclibRateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

let rateLimitedUntil = 0;
// Settled lookups (a 404 counts: it is a stable "no record"). Failures and 429s are never stored.
const responseCache = new Map<string, Promise<unknown>>();
// Full records by id, so fetching lyrics for a search hit needs no second request.
const recordCache = new Map<number, LrclibRecord>();

// Test hook: forgets cached responses and any rate-limit window.
export function resetLrclibState(): void {
    rateLimitedUntil = 0;
    responseCache.clear();
    recordCache.clear();
}

// Keeps a Map bounded by dropping its oldest entry, which is the first in insertion order.
function trimCache<K, V>(cache: Map<K, V>): void {
    while (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (oldest.done) return;
        cache.delete(oldest.value);
    }
}

// Reads a Retry-After header (delta-seconds or HTTP date) into a bounded wait in milliseconds.
function parseRetryAfterMs(header: string | null): number {
    const value = header?.trim();
    if (!value) return DEFAULT_RETRY_AFTER_MS;
    const seconds = Number(value);
    const waitMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
    if (!Number.isFinite(waitMs)) return DEFAULT_RETRY_AFTER_MS;
    return Math.min(Math.max(waitMs, 1000), MAX_RETRY_AFTER_MS);
}

async function requestLrclib(url: string): Promise<unknown> {
    const remainingMs = rateLimitedUntil - Date.now();
    if (remainingMs > 0) {
        throw new LrclibRateLimitError(remainingMs);
    }

    const response = await fetch(url, {
        credentials: 'omit',
        headers: { 'Lrclib-Client': LRCLIB_CLIENT_HEADER_VALUE },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) {
        return null;
    }
    if (response.status === 429) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        rateLimitedUntil = Date.now() + retryAfterMs;
        throw new LrclibRateLimitError(retryAfterMs);
    }
    if (!response.ok) {
        throw new Error(`LRCLIB request failed: ${response.status}`);
    }
    return await response.json();
}

// Deduplicates concurrent identical requests and remembers settled ones for the session.
function requestLrclibCached(url: string): Promise<unknown> {
    const cached = responseCache.get(url);
    if (cached) return cached;

    const pending = requestLrclib(url);
    responseCache.set(url, pending);
    trimCache(responseCache);
    pending.catch(() => {
        if (responseCache.get(url) === pending) responseCache.delete(url);
    });
    return pending;
}

const buildUrl = (path: string, params: Record<string, string>): string => (
    `${LRCLIB_API_BASE}${path}?${new URLSearchParams(params).toString()}`
);

const isLrclibRecord = (value: unknown): value is LrclibRecord => (
    typeof value === 'object' && value !== null && Number.isFinite((value as LrclibRecord).id)
);

// A record is usable when it has line-synced lyrics or is flagged instrumental; plain-only records cannot be shown.
const isUsableRecord = (record: LrclibRecord): boolean => (
    record.instrumental === true || Boolean(record.syncedLyrics?.trim())
);

const rememberRecord = (record: LrclibRecord): void => {
    recordCache.delete(record.id);
    recordCache.set(record.id, record);
    trimCache(recordCache);
};

// Maps an LRCLIB record onto the shared SongResult shape the match scorer and modals already consume.
export function lrclibRecordToSongResult(record: LrclibRecord): SongResult {
    const artistName = record.artistName?.trim() || '';
    return {
        id: record.id,
        name: record.trackName?.trim() || record.name?.trim() || '',
        artists: artistName ? [{ id: 0, name: artistName }] : [],
        album: { id: 0, name: record.albumName?.trim() || '' },
        durationMs: Number.isFinite(record.duration) ? Math.round((record.duration as number) * 1000) : 0,
    };
}

/**
 * Searches LRCLIB by free text (title, artist and album tokens in any order).
 * Plain-only records are dropped because they cannot be rendered. Failures resolve to [] unless `rethrow` is set.
 */
export async function searchLrclibLyrics(
    query: string,
    limit = SEARCH_RESULT_CAP,
    options: { rethrow?: boolean } = {},
): Promise<SongResult[]> {
    const safeQuery = query.trim();
    if (!safeQuery) return [];

    try {
        const data = await requestLrclibCached(buildUrl('/search', { q: safeQuery }));
        const records = Array.isArray(data) ? data.filter(isLrclibRecord).filter(isUsableRecord) : [];
        const limited = records.slice(0, Math.max(1, limit));
        limited.forEach(rememberRecord);
        return limited.map(lrclibRecordToSongResult);
    } catch (error) {
        console.warn('[LRCLIB] Search failed:', error);
        if (options.rethrow) throw error;
        return [];
    }
}

/**
 * Exact lookup by title, artist and duration (LRCLIB matches duration within a couple of seconds).
 * Album is left out on purpose: LRCLIB 404s when a supplied album differs by even one character.
 * Resolves to null when there is no usable record or the request failed.
 */
export async function getLrclibLyricsCandidate(target: LrclibLookupTarget): Promise<SongResult | null> {
    const title = target.title.trim();
    const artist = target.artist.trim();
    const durationSeconds = Math.round(target.durationMs / 1000);
    if (!title || !artist || !(durationSeconds > 0)) return null;

    try {
        const data = await requestLrclibCached(buildUrl('/get', {
            track_name: title,
            artist_name: artist,
            duration: String(durationSeconds),
        }));
        if (!isLrclibRecord(data) || !isUsableRecord(data)) return null;
        rememberRecord(data);
        return lrclibRecordToSongResult(data);
    } catch (error) {
        console.warn('[LRCLIB] Exact lookup failed:', error);
        return null;
    }
}

// Parses the record's synced LRC text with the shared parser; null when it holds nothing renderable.
function parseSyncedLyrics(syncedLyrics: string | null | undefined): LyricData | null {
    const text = syncedLyrics?.trim();
    if (!text) return null;

    const parsed = parseLyricsByFormat(detectTimedLyricFormat(text), text);
    return hasRenderableLyrics(parsed) ? parsed : null;
}

// Turns a record into lyrics, mapping LRCLIB's instrumental flag onto the app's pure-music handling.
export function lrclibRecordToLyricsResult(record: LrclibRecord): LrclibLyricsResult {
    if (record.instrumental === true) {
        return { lyrics: null, isPureMusic: true };
    }
    return { lyrics: parseSyncedLyrics(record.syncedLyrics), isPureMusic: false };
}

/**
 * Fetches the lyrics for a song produced by `searchLrclibLyrics` / `getLrclibLyricsCandidate`.
 * Reuses the record the search already returned and only asks `/api/get/{id}` when it has aged out of the cache.
 * Failures resolve to null so callers can tell "request failed" from "no lyrics" ({ lyrics: null }).
 */
export async function fetchLrclibLyrics(song: SongResult): Promise<LrclibLyricsResult | null> {
    const id = Number(song.id);
    if (!Number.isFinite(id)) {
        throw new Error('Missing LRCLIB record id');
    }

    try {
        let record = recordCache.get(id) ?? null;
        if (!record) {
            const data = await requestLrclibCached(`${LRCLIB_API_BASE}/get/${id}`);
            if (!isLrclibRecord(data)) {
                return { lyrics: null, isPureMusic: false };
            }
            rememberRecord(data);
            record = data;
        }
        return lrclibRecordToLyricsResult(record);
    } catch (error) {
        console.warn('[LRCLIB] Fetch lyrics failed:', error);
        return null;
    }
}
