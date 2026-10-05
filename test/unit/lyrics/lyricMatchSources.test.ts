import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchQQLyrics, fetchQQLyrics } from '@/utils/lyrics/providers/qqLyricProvider';
import {
    LYRIC_MATCH_SOURCES,
    fetchLyricsForMatchSource,
    searchLyricsByMatchSource,
} from '@/utils/lyrics/lyricMatchSources';

// test/unit/lyrics/lyricMatchSources.test.ts
// Covers the lyric-match facade: QQ Music is the only source it routes to.

vi.mock('@/utils/lyrics/providers/qqLyricProvider', () => ({
    searchQQLyrics: vi.fn(),
    fetchQQLyrics: vi.fn(),
}));

const createLyrics = (text: string) => ({
    lines: [{ fullText: text, startTime: 0, endTime: 1, words: [] }],
    isWordByWord: false as const,
});

const qqSong = (id: number, name: string, artist: string) => ({
    id,
    name,
    artists: [{ id, name: artist }],
    album: { id: 0, name: '' },
    durationMs: 200000,
    qqMid: `mid-${id}`,
});

describe('lyricMatchSources', () => {
    const searchQQLyricsMock = vi.mocked(searchQQLyrics);
    const fetchQQLyricsMock = vi.mocked(fetchQQLyrics);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('offers QQ Music as the only match source', () => {
        expect(LYRIC_MATCH_SOURCES).toEqual(['qq']);
    });

    it('searches QQ and sorts the results by match score', async () => {
        searchQQLyricsMock.mockResolvedValue([
            qqSong(1, 'Song Title (Live)', 'Someone Else'),
            qqSong(2, 'Song Title', 'Artist Name'),
        ]);

        const results = await searchLyricsByMatchSource('qq', 'Song Title - Artist Name', {
            title: 'Song Title',
            artist: 'Artist Name',
            durationMs: 200000,
        });

        expect(searchQQLyricsMock).toHaveBeenCalledWith('Song Title - Artist Name');
        expect(results.map(result => result.id)).toEqual([2, 1]);
    });

    it('returns the fetched QQ lyrics when they are renderable', async () => {
        const lyrics = createLyrics('Test lyric');
        fetchQQLyricsMock.mockResolvedValue(lyrics);

        const result = await fetchLyricsForMatchSource('qq', qqSong(2, 'Song Title', 'Artist Name'));

        expect(result).toEqual({ lyrics, isPureMusic: false });
    });

    it('reports no lyrics when QQ returns nothing renderable', async () => {
        fetchQQLyricsMock.mockResolvedValue(null);

        const result = await fetchLyricsForMatchSource('qq', qqSong(2, 'Song Title', 'Artist Name'));

        expect(result).toEqual({ lyrics: null, isPureMusic: false });
    });
});
