import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchQQLyrics, fetchQQLyrics } from '@/utils/lyrics/providers/qqLyricProvider';
import { searchLrclibLyrics, fetchLrclibLyrics } from '@/utils/lyrics/providers/lrclibLyricProvider';
import {
    LYRIC_MATCH_SOURCES,
    fetchLyricsForMatchSource,
    searchLyricsByMatchSource,
} from '@/utils/lyrics/lyricMatchSources';

// test/unit/lyrics/lyricMatchSources.test.ts
// Covers the lyric-match facade: it routes each source to its own provider (QQ Music, LRCLIB).

vi.mock('@/utils/lyrics/providers/qqLyricProvider', () => ({
    searchQQLyrics: vi.fn(),
    fetchQQLyrics: vi.fn(),
}));
vi.mock('@/utils/lyrics/providers/lrclibLyricProvider', () => ({
    searchLrclibLyrics: vi.fn(),
    fetchLrclibLyrics: vi.fn(),
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
    const searchLrclibLyricsMock = vi.mocked(searchLrclibLyrics);
    const fetchLrclibLyricsMock = vi.mocked(fetchLrclibLyrics);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('offers QQ Music first and LRCLIB second as match sources', () => {
        expect(LYRIC_MATCH_SOURCES).toEqual(['qq', 'lrclib']);
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

    it('searches LRCLIB for the lrclib source, sorts by match score, and leaves QQ untouched', async () => {
        searchLrclibLyricsMock.mockResolvedValue([
            qqSong(1, 'Song Title (Live)', 'Someone Else'),
            qqSong(2, 'Song Title', 'Artist Name'),
        ]);

        const results = await searchLyricsByMatchSource('lrclib', 'Song Title - Artist Name', {
            title: 'Song Title',
            artist: 'Artist Name',
            durationMs: 200000,
        });

        expect(searchLrclibLyricsMock).toHaveBeenCalledWith('Song Title - Artist Name');
        expect(searchQQLyricsMock).not.toHaveBeenCalled();
        expect(results.map(result => result.id)).toEqual([2, 1]);
    });

    it('returns the LRCLIB lyrics for the lrclib source and never calls QQ', async () => {
        const lyrics = createLyrics('LRCLIB lyric');
        fetchLrclibLyricsMock.mockResolvedValue({ lyrics, isPureMusic: false });

        const result = await fetchLyricsForMatchSource('lrclib', qqSong(2, 'Song Title', 'Artist Name'));

        expect(result).toEqual({ lyrics, isPureMusic: false });
        expect(fetchQQLyricsMock).not.toHaveBeenCalled();
    });

    it('passes an LRCLIB instrumental through as pure music', async () => {
        fetchLrclibLyricsMock.mockResolvedValue({ lyrics: null, isPureMusic: true });

        await expect(fetchLyricsForMatchSource('lrclib', qqSong(2, 'Song Title', 'Artist Name')))
            .resolves.toEqual({ lyrics: null, isPureMusic: true });
    });
});
