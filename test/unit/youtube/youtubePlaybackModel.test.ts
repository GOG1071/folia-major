import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildYoutubeSong } from '../../../src/services/youtube/buildYoutubeSong';
import { getPlaybackSongKey, getPlaybackSongSource, isYoutubePlaybackSong } from '../../../src/utils/appPlaybackGuards';
import { setYoutubeUrlHandler, tryHandleYoutubeUrlQuery } from '../../../src/services/youtube/youtubeUrlIntake';
import { resolveYoutubeLyrics } from '../../../src/services/youtube/youtubeLyricsResolver';
import { matchQqLyricsForYoutube, YoutubeLyricsLookupError } from '../../../src/utils/lyrics/matchQqLyricsForYoutube';
import { getFromCacheWithMigration, saveToCache } from '../../../src/services/db';

// test/unit/youtube/youtubePlaybackModel.test.ts
// Song identity, URL intake and the cache-first lyric resolver for YouTube tracks.

vi.mock('../../../src/services/db', () => ({ getFromCacheWithMigration: vi.fn(), saveToCache: vi.fn() }));
vi.mock('../../../src/utils/lyrics/matchQqLyricsForYoutube', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../src/utils/lyrics/matchQqLyricsForYoutube')>()),
    matchQqLyricsForYoutube: vi.fn(),
}));

const ID = 'jNQXAC9IVRw';
const lyrics = { lines: [{ fullText: 'hi', startTime: 0, endTime: 1, words: [] }], isWordByWord: false };
const song = { name: 'Lemon', artists: [{ id: 0, name: '米津玄師' }], durationMs: 255000 };

describe('buildYoutubeSong', () => {
    const built = buildYoutubeSong({
        videoId: ID,
        title: 'Taylor Swift - Shake It Off (Official Video)',
        channel: 'TaylorSwiftVEVO',
        durationMs: 219000,
        thumbnailUrl: 'https://i.ytimg.com/x.jpg',
        audioUrl: `folia-youtube://audio/${ID}`,
    });

    it('cleans the title/artist and carries source identity', () => {
        expect(built).toMatchObject({
            id: `youtube:${ID}`,
            name: 'Shake It Off',
            artists: [{ id: 0, name: 'Taylor Swift' }],
            album: { id: 0, name: '', coverUrl: 'https://i.ytimg.com/x.jpg' },
            durationMs: 219000,
            sourceRef: { kind: 'youtube', mediaId: ID },
            youtubeAudioUrl: `folia-youtube://audio/${ID}`,
        });
    });

    it('is recognised as a distinct playback source', () => {
        expect(isYoutubePlaybackSong(built)).toBe(true);
        expect(getPlaybackSongKey(built)).toBe(`youtube:${ID}`);
        expect(getPlaybackSongSource(built)).toBe('youtube');
    });
});

describe('youtube url intake', () => {
    it('hands YouTube links to the registered handler only', () => {
        const handler = vi.fn();
        setYoutubeUrlHandler(handler);
        expect(tryHandleYoutubeUrlQuery(`  https://youtu.be/${ID}  `)).toBe(true);
        expect(handler).toHaveBeenCalledWith(`https://youtu.be/${ID}`);
        expect(tryHandleYoutubeUrlQuery('告白气球')).toBe(false);
        setYoutubeUrlHandler(null);
        expect(tryHandleYoutubeUrlQuery(`https://youtu.be/${ID}`)).toBe(false);
    });
});

describe('resolveYoutubeLyrics', () => {
    beforeEach(() => {
        vi.mocked(getFromCacheWithMigration).mockReset();
        vi.mocked(saveToCache).mockReset();
        vi.mocked(matchQqLyricsForYoutube).mockReset();
    });

    it('serves a cached hit without a network lookup', async () => {
        vi.mocked(getFromCacheWithMigration).mockResolvedValue({ matchedLyrics: lyrics, qqMid: 'm1', checkedAt: 1 });
        await expect(resolveYoutubeLyrics(ID, song)).resolves.toMatchObject({ status: 'matched', qqMid: 'm1' });
        expect(matchQqLyricsForYoutube).not.toHaveBeenCalled();
    });

    it('does not re-query a remembered miss', async () => {
        vi.mocked(getFromCacheWithMigration).mockResolvedValue({ noMatch: true, checkedAt: 1 });
        await expect(resolveYoutubeLyrics(ID, song)).resolves.toEqual({ status: 'none' });
        expect(matchQqLyricsForYoutube).not.toHaveBeenCalled();
    });

    it('caches a fresh hit and a fresh miss', async () => {
        vi.mocked(getFromCacheWithMigration).mockResolvedValue(null);
        vi.mocked(matchQqLyricsForYoutube).mockResolvedValueOnce({ lyrics, song: { id: 5, qqMid: 'm5' } as any, score: 90 });
        await expect(resolveYoutubeLyrics(ID, song)).resolves.toMatchObject({ status: 'matched', qqMid: 'm5' });
        expect(saveToCache).toHaveBeenLastCalledWith(`youtube_match_${ID}`, expect.objectContaining({ qqMid: 'm5', score: 90 }));

        vi.mocked(matchQqLyricsForYoutube).mockResolvedValueOnce(null);
        await expect(resolveYoutubeLyrics(ID, song)).resolves.toEqual({ status: 'none' });
        expect(saveToCache).toHaveBeenLastCalledWith(`youtube_match_${ID}`, expect.objectContaining({ noMatch: true }));
    });

    it('never caches a failed lookup, so the next play retries', async () => {
        vi.mocked(getFromCacheWithMigration).mockResolvedValue(null);
        vi.mocked(matchQqLyricsForYoutube).mockRejectedValue(new YoutubeLyricsLookupError('timeout'));
        await expect(resolveYoutubeLyrics(ID, song)).resolves.toEqual({ status: 'failed' });
        expect(saveToCache).not.toHaveBeenCalled();
    });
});
