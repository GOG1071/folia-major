import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import {
    matchQqLyricsForYoutube,
    YOUTUBE_QQ_MATCH_MIN_SCORE,
    YoutubeLyricsLookupError,
} from '@/utils/lyrics/matchQqLyricsForYoutube';
import { calculateMatchScoreDetails } from '@/utils/lyrics/matchScore';
import { fetchQQLyrics, searchQQLyrics } from '@/utils/lyrics/providers/qqLyricProvider';

// test/unit/lyrics/matchQqLyricsForYoutube.test.ts
// Candidate selection for YouTube uploads, with the QQ provider mocked.

vi.mock('@/utils/lyrics/providers/qqLyricProvider', () => ({
    searchQQLyrics: vi.fn(),
    fetchQQLyrics: vi.fn(),
}));

const candidate = (id: number, name: string, artist: string, durationMs = 215000): SongResult => ({
    id,
    name,
    artists: [{ id, name: artist }],
    album: { id, name: 'Album' },
    durationMs,
    qqMid: `mid${id}`,
});

const lyricData = (text = 'la la la') => ({
    lines: [{ fullText: text, startTime: 0, endTime: 1, words: [] }],
    isWordByWord: false,
});

const searchMock = vi.mocked(searchQQLyrics);
const fetchMock = vi.mocked(fetchQQLyrics);

describe('matchQqLyricsForYoutube', () => {
    beforeEach(() => {
        searchMock.mockReset();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(lyricData());
    });

    it('picks the highest-scoring candidate whose title matches', async () => {
        searchMock.mockResolvedValue([
            candidate(1, 'Shake It Off (Karaoke)', 'Karaoke Band'),
            candidate(2, 'Shake It Off', 'Taylor Swift'),
            candidate(3, 'Shake It Off', 'Someone Else'),
        ]);
        const result = await matchQqLyricsForYoutube({ title: 'Shake It Off', artist: 'Taylor Swift', durationMs: 219000 });
        expect(result?.song.id).toBe(2);
        expect(result?.score).toBeGreaterThanOrEqual(YOUTUBE_QQ_MATCH_MIN_SCORE);
        expect(fetchMock).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
        expect(searchMock).toHaveBeenCalledWith('Shake It Off - Taylor Swift', 1, 10, { rethrow: true });
    });

    it('rejects candidates whose title does not match even with the right artist', async () => {
        searchMock.mockResolvedValue([candidate(1, 'Blank Space', 'Taylor Swift')]);
        const result = await matchQqLyricsForYoutube({ title: 'Shake It Off', artist: 'Taylor Swift', durationMs: 219000 });
        expect(result).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a title match that scores below the threshold', async () => {
        // Title similarity 13/20 = 0.65 passes the title gate, but with no artist or duration support the
        // score stays under the threshold. The preconditions pin that this is the threshold doing the
        // rejecting and not the title gate.
        const target = { title: 'midnight sky blue now', artist: 'Taylor Swift', durationMs: 219000 };
        const weak = candidate(1, 'midnight sky b', 'Zzz', 90000);
        const details = calculateMatchScoreDetails(target, weak);
        expect(details.titleMatched).toBe(true);
        expect(calculateMatchScoreDetails({ ...target, durationMs: 0 }, weak).score).toBeLessThan(YOUTUBE_QQ_MATCH_MIN_SCORE);
        expect(details.score).toBeLessThan(YOUTUBE_QQ_MATCH_MIN_SCORE);

        searchMock.mockResolvedValue([weak]);
        await expect(matchQqLyricsForYoutube(target)).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not let a long music-video duration sink a correct title and artist match', async () => {
        searchMock.mockResolvedValue([candidate(1, '告白气球', '周杰伦', 215000)]);
        const result = await matchQqLyricsForYoutube({ title: '告白氣球 Love Confession', artist: '周杰倫 Jay Chou', durationMs: 260000 });
        expect(result?.song.id).toBe(1);
    });

    it('retries with the title alone when the artist-qualified search finds nothing', async () => {
        searchMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([candidate(7, 'Lemon', '米津玄師')]);
        const result = await matchQqLyricsForYoutube({ title: 'Lemon', artist: 'Some Fan Channel', durationMs: 255000 });
        expect(result?.song.id).toBe(7);
        expect(searchMock).toHaveBeenNthCalledWith(1, 'Lemon - Some Fan Channel', 1, 10, { rethrow: true });
        expect(searchMock).toHaveBeenNthCalledWith(2, 'Lemon', 1, 10, { rethrow: true });
    });

    it('does not issue a second search when there was no artist to drop', async () => {
        searchMock.mockResolvedValue([]);
        await expect(matchQqLyricsForYoutube({ title: 'Lemon', artist: '', durationMs: 255000 })).resolves.toBeNull();
        expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it('returns null when the matched lyrics are not renderable', async () => {
        searchMock.mockResolvedValue([candidate(1, 'Lemon', '米津玄師')]);
        fetchMock.mockResolvedValue(lyricData('   '));
        await expect(matchQqLyricsForYoutube({ title: 'Lemon', artist: '米津玄師', durationMs: 255000 })).resolves.toBeNull();
    });

    it('throws a lookup error, not null, when the lyric fetch yields nothing', async () => {
        searchMock.mockResolvedValue([candidate(1, 'Lemon', '米津玄師')]);
        fetchMock.mockResolvedValue(null);
        await expect(matchQqLyricsForYoutube({ title: 'Lemon', artist: '米津玄師', durationMs: 255000 }))
            .rejects.toBeInstanceOf(YoutubeLyricsLookupError);
    });

    it('throws a lookup error, not null, when QQ rejects the search (rate limit, network)', async () => {
        searchMock.mockRejectedValue(new Error('QQ Music API error: code 2001'));
        await expect(matchQqLyricsForYoutube({ title: 'Shake It Off', artist: 'Taylor Swift', durationMs: 219000 }))
            .rejects.toBeInstanceOf(YoutubeLyricsLookupError);
        // A failed attempt must not fall through to the title-only retry as if it were a miss.
        expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it('throws a lookup error when the search times out', async () => {
        vi.useFakeTimers();
        try {
            searchMock.mockReturnValue(new Promise(() => undefined));
            const pending = matchQqLyricsForYoutube({ title: 'Lemon', artist: 'x', durationMs: 1000 });
            const assertion = expect(pending).rejects.toBeInstanceOf(YoutubeLyricsLookupError);
            await vi.advanceTimersByTimeAsync(7000);
            await assertion;
        } finally {
            vi.useRealTimers();
        }
    });
});
