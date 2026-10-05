import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoMatchBestLyric } from '@/utils/lyrics/autoMatchBestLyric';
import { searchQQLyrics, fetchQQLyrics } from '@/utils/lyrics/providers/qqLyricProvider';

// test/unit/lyrics/autoMatchBestLyric.test.ts
// Unit tests for the best lyric auto-matcher (QQ Music is the only lyric provider).

vi.mock('@/utils/lyrics/providers/qqLyricProvider', () => ({
    searchQQLyrics: vi.fn(),
    fetchQQLyrics: vi.fn()
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
});
