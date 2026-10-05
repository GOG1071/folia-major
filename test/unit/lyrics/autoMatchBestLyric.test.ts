import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoMatchBestLyric } from '@/utils/lyrics/autoMatchBestLyric';
import { searchQQLyrics, fetchQQLyrics } from '@/utils/lyrics/providers/qqLyricProvider';
import {
    fetchLrclibLyrics,
    getLrclibLyricsCandidate,
    searchLrclibLyrics,
} from '@/utils/lyrics/providers/lrclibLyricProvider';

// test/unit/lyrics/autoMatchBestLyric.test.ts
// Unit tests for the best lyric auto-matcher: QQ Music first, LRCLIB only as the fallback when QQ has nothing.

vi.mock('@/utils/lyrics/providers/qqLyricProvider', () => ({
    searchQQLyrics: vi.fn(),
    fetchQQLyrics: vi.fn()
}));
vi.mock('@/utils/lyrics/providers/lrclibLyricProvider', () => ({
    searchLrclibLyrics: vi.fn(),
    fetchLrclibLyrics: vi.fn(),
    getLrclibLyricsCandidate: vi.fn(),
}));

const createLyrics = (isWordByWord: boolean) => ({
    lines: [{
        fullText: 'Test lyric',
        startTime: 0,
        endTime: 1,
        words: [],
    }],
    isWordByWord,
});

describe('autoMatchBestLyric', () => {
    const searchQQLyricsMock = vi.mocked(searchQQLyrics);
    const fetchQQLyricsMock = vi.mocked(fetchQQLyrics);
    const searchLrclibLyricsMock = vi.mocked(searchLrclibLyrics);
    const fetchLrclibLyricsMock = vi.mocked(fetchLrclibLyrics);
    const getLrclibLyricsCandidateMock = vi.mocked(getLrclibLyricsCandidate);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('reuses the active QQ provider candidate without searching or fetching QQ again', async () => {
        const qqSong = {
            id: 201,
            qqMid: 'qq-mid',
            name: 'Song Title',
            artists: [{ id: 1, name: 'Artist Name' }],
            album: { id: 2, name: 'Album' },
            durationMs: 200000,
            sourceRef: { kind: 'online' as const, providerId: 'qq', mediaId: 'qq-mid' },
        };
        const lyrics = createLyrics(true);

        const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000, {
            providerCandidate: {
                providerId: 'qq',
                song: qqSong,
                lyricsResult: { lyrics, isPureMusic: false },
            },
        });

        expect(result).toMatchObject({ source: 'qq', id: 201, qqMid: 'qq-mid', lyrics });
        expect(searchQQLyricsMock).not.toHaveBeenCalled();
        expect(fetchQQLyricsMock).not.toHaveBeenCalled();
    });

    it('accepts the selected QQ lyric directly when best-lyric selection is disabled', async () => {
        searchQQLyricsMock.mockResolvedValue([
            { id: 201, name: 'Correct title', durationMs: 200000, artists: [{ id: 1, name: 'Wrong artist' }], album: { id: 2, name: 'Wrong album' }, qqMid: 'distractor-mid' },
            { id: 202, name: 'Correct title', durationMs: 200000, artists: [{ id: 3, name: 'Correct artist' }], album: { id: 4, name: 'Correct album' }, qqMid: 'selected-mid' },
        ]);
        fetchQQLyricsMock.mockResolvedValue(createLyrics(false));

        const result = await autoMatchBestLyric('Correct title', 'Correct artist', 200000, {
            album: 'Correct album',
            metadataCandidate: { source: 'qq', songId: 'selected-mid' },
            exactMatchOnly: true,
        }) as any;

        expect(searchQQLyricsMock).toHaveBeenCalledWith('Correct title - Correct artist - Correct album', 1, 10);
        expect(fetchQQLyricsMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: 202, qqMid: 'selected-mid' }),
            { chorusRanges: [] },
        );
        expect(result).toMatchObject({ source: 'qq', id: 202, qqMid: 'selected-mid' });
    });

    it('returns null in exact-only mode when the selected QQ song is not among the results', async () => {
        searchQQLyricsMock.mockResolvedValue([
            { id: 201, name: 'Correct title', durationMs: 200000, artists: [{ id: 1, name: 'Correct artist' }], album: { id: 2, name: 'Album' }, qqMid: 'other-mid' },
        ]);

        const result = await autoMatchBestLyric('Correct title', 'Correct artist', 200000, {
            metadataCandidate: { source: 'qq', songId: 'selected-mid' },
            exactMatchOnly: true,
        });

        expect(result).toBeNull();
        expect(fetchQQLyricsMock).not.toHaveBeenCalled();
    });

    it('returns a high-confidence line-by-line match when QQ has no word-by-word lyrics', async () => {
        const lineByLineLyrics = createLyrics(false);
        searchQQLyricsMock.mockResolvedValue([
            { id: 201, name: 'Song Title', durationMs: 200000, artists: [{ id: 1, name: 'Artist Name' }], album: { id: 0, name: '' }, qqMid: 'mid-line' },
        ]);
        fetchQQLyricsMock.mockResolvedValue(lineByLineLyrics);

        const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000) as any;

        expect(result).toMatchObject({ source: 'qq', id: 201, qqMid: 'mid-line', lyrics: lineByLineLyrics });
    });

    it('stops matching when the QQ candidate is pure music', async () => {
        const qqSong = {
            id: 201,
            qqMid: 'qq-mid',
            name: 'Song Title',
            artists: [{ id: 1, name: 'Artist Name' }],
            album: { id: 2, name: 'Album' },
            durationMs: 200000,
        };

        const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000, {
            providerCandidate: {
                providerId: 'qq',
                song: qqSong,
                lyricsResult: { lyrics: null, isPureMusic: true },
            },
        });

        expect(result).toEqual({ isPureMusic: true, source: 'qq', id: 201 });
        expect(fetchQQLyricsMock).not.toHaveBeenCalled();
    });

    it('normalizes accidental ms * 1000 durations before filtering candidates', async () => {
        searchQQLyricsMock.mockResolvedValue([
            {
                id: 201,
                name: 'Night of Bloom',
                durationMs: 286000,
                artists: [{ id: 1, name: 'Kirara Magic' }, { id: 2, name: 'Xomu' }, { id: 3, name: 'nayuta' }],
                album: { id: 0, name: '' },
                qqMid: 'mid-night'
            }
        ]);
        fetchQQLyricsMock.mockResolvedValue(createLyrics(true));

        const result = await autoMatchBestLyric(
            'Night of Bloom (feat. nayuta)',
            'Kirara Magic/Xomu/nayuta',
            286000000
        ) as any;

        expect(result.source).toBe('qq');
        expect(result.qqMid).toBe('mid-night');
    });

    it('scores the top 10 QQ results and fetches only the highest scoring candidate', async () => {
        const distractors = [
            { id: 200, name: 'Night Of Bloom (Starling Remix)', durationMs: 286000, artists: [{ id: 1, name: 'Xomu' }, { id: 2, name: 'StarlingEDM' }, { id: 3, name: 'nayuta' }], album: { id: 0, name: '' }, qqMid: 'remix' },
            { id: 201, name: 'Night of Bloom', durationMs: 286000, artists: [{ id: 1, name: 'Ayrex' }], album: { id: 0, name: '' }, qqMid: 'wrong-artist-1' },
            { id: 202, name: 'Night of Bloom', durationMs: 286000, artists: [{ id: 1, name: 'Nightcore Vibe' }], album: { id: 0, name: '' }, qqMid: 'wrong-artist-2' },
            { id: 203, name: 'Night of Bloom (K歌版)', durationMs: 286000, artists: [{ id: 1, name: '東京都立中央精神病院院長' }], album: { id: 0, name: '' }, qqMid: 'karaoke' },
            { id: 204, name: 'Night of Bloom remix', durationMs: 286000, artists: [{ id: 1, name: 'Gphuuuuuc' }], album: { id: 0, name: '' }, qqMid: 'remix-2' }
        ];
        const correct = {
            id: 205,
            name: 'Night of Bloom',
            durationMs: 286000,
            artists: [{ id: 1, name: 'Kirara Magic' }, { id: 2, name: 'Xomu' }, { id: 3, name: 'nayuta' }],
            album: { id: 1, name: 'Night of Bloom' },
            qqMid: 'correct-mid'
        };
        searchQQLyricsMock.mockResolvedValue([...distractors, correct]);
        fetchQQLyricsMock.mockResolvedValue(createLyrics(true));

        const result = await autoMatchBestLyric(
            'Night of Bloom (feat. nayuta)',
            'Kirara Magic/Xomu/nayuta',
            286000,
            { album: 'Night of Bloom' }
        ) as any;

        expect(searchQQLyricsMock).toHaveBeenCalledWith(
            'Night of Bloom (feat. nayuta) - Kirara Magic/Xomu/nayuta - Night of Bloom',
            1,
            10
        );
        expect(fetchQQLyricsMock).toHaveBeenCalledTimes(1);
        expect(fetchQQLyricsMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: 205, qqMid: 'correct-mid' }),
            { chorusRanges: [] }
        );
        expect(result.source).toBe('qq');
        expect(result.qqMid).toBe('correct-mid');
    });

    it('returns null when QQ has no search results', async () => {
        searchQQLyricsMock.mockResolvedValue([]);

        const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000);
        expect(result).toBeNull();
    });

    describe('LRCLIB fallback', () => {
        const lrclibSong = (id: number, name: string, artist: string, durationMs = 200000) => ({
            id,
            name,
            artists: [{ id: 0, name: artist }],
            album: { id: 0, name: 'Album' },
            durationMs,
        });

        it('uses the exact LRCLIB lookup when QQ has no search results', async () => {
            const lyrics = createLyrics(false);
            searchQQLyricsMock.mockResolvedValue([]);
            const exact = lrclibSong(16233, 'Yellow', 'Coldplay', 267000);
            getLrclibLyricsCandidateMock.mockResolvedValue(exact);
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics, isPureMusic: false });

            const result = await autoMatchBestLyric('Yellow', 'Coldplay', 267000, { album: 'Parachutes' }) as any;

            expect(getLrclibLyricsCandidateMock).toHaveBeenCalledWith({ title: 'Yellow', artist: 'Coldplay', durationMs: 267000 });
            expect(searchLrclibLyricsMock).not.toHaveBeenCalled();
            expect(result).toMatchObject({ source: 'lrclib', id: 16233, lyrics, song: exact });
        });

        it('falls back to an LRCLIB text search without the album when the exact lookup misses', async () => {
            const lyrics = createLyrics(false);
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue(null);
            searchLrclibLyricsMock.mockResolvedValue([
                lrclibSong(1, 'Yellow (Karaoke)', 'Karaoke Crew', 267000),
                lrclibSong(2, 'Yellow', 'Coldplay', 267000),
            ]);
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics, isPureMusic: false });

            const result = await autoMatchBestLyric('Yellow', 'Coldplay', 267000, { album: 'Parachutes' }) as any;

            expect(searchLrclibLyricsMock).toHaveBeenCalledWith('Yellow - Coldplay', 10);
            expect(fetchLrclibLyricsMock).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
            expect(result).toMatchObject({ source: 'lrclib', id: 2, lyrics });
        });

        it('rejects LRCLIB candidates whose title and artist do not match', async () => {
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue(null);
            searchLrclibLyricsMock.mockResolvedValue([lrclibSong(3, 'Totally Different', 'Someone Else')]);

            await expect(autoMatchBestLyric('Yellow', 'Coldplay', 200000)).resolves.toBeNull();
            expect(fetchLrclibLyricsMock).not.toHaveBeenCalled();
        });

        it('accepts a duration-verified exact hit even when LRCLIB files it under a different album', async () => {
            const lyrics = createLyrics(false);
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue({
                ...lrclibSong(16232, 'Yellow', 'Coldplay', 267000),
                album: { id: 0, name: 'Yellow - Single' },
            });
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics, isPureMusic: false });

            const result = await autoMatchBestLyric('Yellow', 'Coldplay', 267000, { album: 'Parachutes' }) as any;

            expect(result).toMatchObject({ source: 'lrclib', id: 16232, lyrics });
            expect(searchLrclibLyricsMock).not.toHaveBeenCalled();
        });

        it('rejects an exact LRCLIB hit whose title or artist does not match, then tries the search', async () => {
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue(lrclibSong(4, 'Yellow Submarine', 'The Beatles', 267000));
            searchLrclibLyricsMock.mockResolvedValue([]);

            await expect(autoMatchBestLyric('Yellow', 'Coldplay', 267000)).resolves.toBeNull();
            expect(searchLrclibLyricsMock).toHaveBeenCalled();
        });

        it('rejects an exact LRCLIB hit whose duration is far off, then tries the search', async () => {
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue(lrclibSong(4, 'Yellow', 'Coldplay', 400000));
            searchLrclibLyricsMock.mockResolvedValue([]);

            await expect(autoMatchBestLyric('Yellow', 'Coldplay', 267000)).resolves.toBeNull();
            expect(searchLrclibLyricsMock).toHaveBeenCalled();
        });

        it('reports an LRCLIB instrumental as pure music', async () => {
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue(lrclibSong(5, 'Song Title', 'Artist Name'));
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics: null, isPureMusic: true });

            await expect(autoMatchBestLyric('Song Title', 'Artist Name', 200000))
                .resolves.toEqual({ isPureMusic: true, source: 'lrclib', id: 5 });
        });

        it('returns null when the matched LRCLIB record has nothing renderable', async () => {
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockResolvedValue(lrclibSong(6, 'Song Title', 'Artist Name'));
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics: null, isPureMusic: false });

            await expect(autoMatchBestLyric('Song Title', 'Artist Name', 200000)).resolves.toBeNull();
        });

        it('takes over when the QQ lyric fetch yields nothing renderable', async () => {
            const lyrics = createLyrics(false);
            searchQQLyricsMock.mockResolvedValue([
                { id: 201, name: 'Song Title', durationMs: 200000, artists: [{ id: 1, name: 'Artist Name' }], album: { id: 0, name: '' }, qqMid: 'mid' },
            ]);
            fetchQQLyricsMock.mockResolvedValue(null);
            getLrclibLyricsCandidateMock.mockResolvedValue(lrclibSong(7, 'Song Title', 'Artist Name'));
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics, isPureMusic: false });

            const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000) as any;

            expect(result).toMatchObject({ source: 'lrclib', id: 7, lyrics });
        });

        it('takes over for an active QQ track whose own lyrics are empty', async () => {
            const lyrics = createLyrics(false);
            getLrclibLyricsCandidateMock.mockResolvedValue(lrclibSong(8, 'Song Title', 'Artist Name'));
            fetchLrclibLyricsMock.mockResolvedValue({ lyrics, isPureMusic: false });

            const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000, {
                providerCandidate: {
                    providerId: 'qq',
                    song: { id: 201, qqMid: 'qq-mid', name: 'Song Title', artists: [{ id: 1, name: 'Artist Name' }], album: { id: 2, name: 'Album' }, durationMs: 200000 },
                    lyricsResult: { lyrics: null, isPureMusic: false },
                },
            }) as any;

            expect(result).toMatchObject({ source: 'lrclib', id: 8 });
        });

        it('never asks LRCLIB once QQ produced word-by-word lyrics', async () => {
            searchQQLyricsMock.mockResolvedValue([
                { id: 201, name: 'Song Title', durationMs: 200000, artists: [{ id: 1, name: 'Artist Name' }], album: { id: 0, name: '' }, qqMid: 'mid' },
            ]);
            fetchQQLyricsMock.mockResolvedValue(createLyrics(true));

            const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000) as any;

            expect(result.source).toBe('qq');
            expect(getLrclibLyricsCandidateMock).not.toHaveBeenCalled();
            expect(searchLrclibLyricsMock).not.toHaveBeenCalled();
        });

        it('keeps QQ line-by-line lyrics over LRCLIB, which cannot be word-by-word, and skips the request', async () => {
            const qqLyrics = createLyrics(false);
            searchQQLyricsMock.mockResolvedValue([
                { id: 201, name: 'Song Title', durationMs: 200000, artists: [{ id: 1, name: 'Artist Name' }], album: { id: 0, name: '' }, qqMid: 'mid' },
            ]);
            fetchQQLyricsMock.mockResolvedValue(qqLyrics);

            const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000) as any;

            expect(result).toMatchObject({ source: 'qq', lyrics: qqLyrics });
            expect(getLrclibLyricsCandidateMock).not.toHaveBeenCalled();
            expect(searchLrclibLyricsMock).not.toHaveBeenCalled();
        });

        it('keeps a pure-music verdict from QQ without consulting LRCLIB', async () => {
            const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000, {
                providerCandidate: {
                    providerId: 'qq',
                    song: { id: 201, qqMid: 'qq-mid', name: 'Song Title', artists: [{ id: 1, name: 'Artist Name' }], album: { id: 2, name: 'Album' }, durationMs: 200000 },
                    lyricsResult: { lyrics: null, isPureMusic: true },
                },
            });

            expect(result).toEqual({ isPureMusic: true, source: 'qq', id: 201 });
            expect(getLrclibLyricsCandidateMock).not.toHaveBeenCalled();
        });

        it('does not replace a hand-picked QQ identity: exact-only mode never reaches LRCLIB', async () => {
            searchQQLyricsMock.mockResolvedValue([]);

            const result = await autoMatchBestLyric('Song Title', 'Artist Name', 200000, {
                metadataCandidate: { source: 'qq', songId: 'selected-mid' },
                exactMatchOnly: true,
            });

            expect(result).toBeNull();
            expect(getLrclibLyricsCandidateMock).not.toHaveBeenCalled();
            expect(searchLrclibLyricsMock).not.toHaveBeenCalled();
        });

        it('swallows an LRCLIB failure and reports no match', async () => {
            searchQQLyricsMock.mockResolvedValue([]);
            getLrclibLyricsCandidateMock.mockRejectedValue(new Error('network down'));
            vi.spyOn(console, 'error').mockImplementation(() => undefined);

            await expect(autoMatchBestLyric('Song Title', 'Artist Name', 200000)).resolves.toBeNull();
        });
    });
});
