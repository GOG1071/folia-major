import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fetchLrclibLyrics,
    getLrclibLyricsCandidate,
    LrclibRateLimitError,
    lrclibRecordToSongResult,
    resetLrclibState,
    searchLrclibLyrics,
    type LrclibRecord,
} from '@/utils/lyrics/providers/lrclibLyricProvider';
import { INTERLUDE_FULL_TEXT } from '@/utils/lyrics/parserCore';

// test/unit/lyrics/lrclibLyricProvider.test.ts
// Covers the LRCLIB lyric source with a mocked fetch: exact lookup, search, instrumental, synced vs plain, 429.

const SYNCED = '[00:33.80] Look at the stars\n[00:36.23] Look how they shine for you\n[00:40.43] \n[00:41.82] And everything you do';

const record = (overrides: Partial<LrclibRecord> = {}): LrclibRecord => ({
    id: 16233,
    name: 'Yellow',
    trackName: 'Yellow',
    artistName: 'Coldplay',
    albumName: 'Parachutes',
    duration: 267.0,
    instrumental: false,
    hasWordSync: false,
    plainLyrics: 'Look at the stars',
    syncedLyrics: SYNCED,
    ...overrides,
});

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
});

describe('LRCLIB lyric provider', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        resetLrclibState();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('maps a record onto a SongResult with millisecond duration', () => {
        expect(lrclibRecordToSongResult(record({ duration: 266.6 }))).toEqual({
            id: 16233,
            name: 'Yellow',
            artists: [{ id: 0, name: 'Coldplay' }],
            album: { id: 0, name: 'Parachutes' },
            durationMs: 266600,
        });
    });

    it('looks a track up by title, artist and rounded duration, without an album, and identifies the client', async () => {
        fetchMock.mockResolvedValue(json(record()));

        const candidate = await getLrclibLyricsCandidate({ title: 'Yellow', artist: 'Coldplay', durationMs: 266600 });

        expect(candidate).toMatchObject({ id: 16233, name: 'Yellow', durationMs: 267000 });
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://lrclib.net/api/get?track_name=Yellow&artist_name=Coldplay&duration=267');
        expect(init.headers).toEqual({ 'Lrclib-Client': expect.stringContaining('Folia') });
        expect(init.credentials).toBe('omit');
    });

    it('skips the exact lookup when the duration or artist is unknown', async () => {
        await expect(getLrclibLyricsCandidate({ title: 'Yellow', artist: 'Coldplay', durationMs: 0 })).resolves.toBeNull();
        await expect(getLrclibLyricsCandidate({ title: 'Yellow', artist: '', durationMs: 267000 })).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resolves a 404 exact lookup to null so the caller can fall back to search', async () => {
        fetchMock.mockResolvedValue(json({ code: 404, name: 'TrackNotFound' }, { status: 404 }));

        await expect(getLrclibLyricsCandidate({ title: 'Nope', artist: 'Nobody', durationMs: 100000 })).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('treats an exact hit that has only plain lyrics as a miss', async () => {
        fetchMock.mockResolvedValue(json(record({ syncedLyrics: null })));

        await expect(getLrclibLyricsCandidate({ title: 'Yellow', artist: 'Coldplay', durationMs: 267000 })).resolves.toBeNull();
    });

    it('searches by free text and drops plain-only records because they cannot be rendered', async () => {
        fetchMock.mockResolvedValue(json([
            record({ id: 1 }),
            record({ id: 2, syncedLyrics: null }),
            record({ id: 3, syncedLyrics: '', instrumental: true }),
        ]));

        const results = await searchLrclibLyrics('Yellow - Coldplay');

        expect(results.map(result => result.id)).toEqual([1, 3]);
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://lrclib.net/api/search?q=Yellow+-+Coldplay');
    });

    it('returns [] for a blank query and for a failed search, unless rethrow is requested', async () => {
        await expect(searchLrclibLyrics('   ')).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();

        fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
        await expect(searchLrclibLyrics('Yellow')).resolves.toEqual([]);
        await expect(searchLrclibLyrics('Yellow', 20, { rethrow: true })).rejects.toThrow('LRCLIB request failed: 500');
    });

    it('parses synced lyrics with the shared LRC parser and reuses the searched record without a second request', async () => {
        fetchMock.mockResolvedValue(json([record()]));
        const [song] = await searchLrclibLyrics('Yellow Coldplay');

        const result = await fetchLrclibLyrics(song);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result?.isPureMusic).toBe(false);
        expect(result?.lyrics?.isWordByWord).toBe(false);
        // The shared parser inserts '......' interludes for the intro and blank-line gaps.
        expect(result?.lyrics?.lines.map(line => line.fullText).filter(text => text && text !== INTERLUDE_FULL_TEXT)).toEqual([
            'Look at the stars',
            'Look how they shine for you',
            'And everything you do',
        ]);
        expect(result?.lyrics?.lines.find(line => line.fullText === 'Look at the stars')?.startTime).toBeCloseTo(33.8, 2);
    });

    it('fetches the record by id when it is not cached, and reports plain-only records as no lyrics', async () => {
        fetchMock.mockResolvedValue(json(record({ id: 77, syncedLyrics: null })));

        const result = await fetchLrclibLyrics({ id: 77, name: 'Yellow', artists: [], album: { id: 0, name: '' }, durationMs: 0 });

        expect(String(fetchMock.mock.calls[0][0])).toBe('https://lrclib.net/api/get/77');
        expect(result).toEqual({ lyrics: null, isPureMusic: false });
    });

    it('maps the instrumental flag onto pure music handling', async () => {
        fetchMock.mockResolvedValue(json([record({ id: 5, instrumental: true, syncedLyrics: null, plainLyrics: null })]));
        const [song] = await searchLrclibLyrics('Some Instrumental');

        await expect(fetchLrclibLyrics(song)).resolves.toEqual({ lyrics: null, isPureMusic: true });
    });

    it('resolves a failed lyric fetch to null, distinct from a record with no lyrics', async () => {
        fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(fetchLrclibLyrics({ id: 9, name: 'x', artists: [], album: { id: 0, name: '' }, durationMs: 0 })).resolves.toBeNull();
    });

    it('caches settled lookups so replaying a song does not hit the API again', async () => {
        fetchMock.mockImplementation(async () => json([record()]));

        await searchLrclibLyrics('Yellow Coldplay');
        await searchLrclibLyrics('Yellow Coldplay');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failed request, so the next attempt retries', async () => {
        fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 })).mockResolvedValueOnce(json([record()]));

        await expect(searchLrclibLyrics('Yellow')).resolves.toEqual([]);
        await expect(searchLrclibLyrics('Yellow')).resolves.toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('honours 429 retry-after: no request is sent until the window ends, then lookups resume', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
        fetchMock.mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'retry-after': '12' } }));

        await expect(searchLrclibLyrics('Yellow', 20, { rethrow: true })).rejects.toBeInstanceOf(LrclibRateLimitError);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Inside the window: other lookups are refused locally, nothing reaches the network.
        await expect(searchLrclibLyrics('Another song')).resolves.toEqual([]);
        await expect(getLrclibLyricsCandidate({ title: 'Another', artist: 'Song', durationMs: 100000 })).resolves.toBeNull();
        await expect(fetchLrclibLyrics({ id: 9, name: 'x', artists: [], album: { id: 0, name: '' }, durationMs: 0 })).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-10-05T00:00:13Z'));
        fetchMock.mockResolvedValueOnce(json([record()]));
        await expect(searchLrclibLyrics('Another song')).resolves.toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to a default wait when a 429 carries no usable retry-after', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
        fetchMock.mockResolvedValueOnce(new Response('slow down', { status: 429 }));
        await searchLrclibLyrics('Yellow');

        vi.setSystemTime(new Date('2026-10-05T00:00:20Z'));
        await searchLrclibLyrics('Other');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-10-05T00:00:31Z'));
        fetchMock.mockResolvedValueOnce(json([]));
        await searchLrclibLyrics('Other');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
