import { getFromCacheWithMigration, saveToCache } from '../db';
import type { LyricData, SongResult } from '../../types';
import { hasRenderableLyrics } from '../../utils/appPlaybackHelpers';
import { matchQqLyricsForYoutube, YoutubeLyricsLookupError } from '../../utils/lyrics/matchQqLyricsForYoutube';
import { migrateMatchedLyricsCarrierRenderHints } from '../../utils/lyrics/storageMigration';

// src/services/youtube/youtubeLyricsResolver.ts
// Cache-first QQ lyric lookup for a YouTube track, remembering both hits and genuine misses.

export interface YoutubeMatchRecord {
    /** Named `matchedLyrics` so the shared render-hint migration applies to it. */
    matchedLyrics?: LyricData;
    qqMid?: string;
    qqSongId?: number | string;
    score?: number;
    /** QQ answered and nothing acceptable came back; a failed lookup is never recorded. */
    noMatch?: boolean;
    checkedAt: number;
}

export type YoutubeLyricsOutcome =
    | { status: 'matched'; lyrics: LyricData; qqMid?: string }
    | { status: 'none' }
    /** The lookup could not finish (network, rate limit); nothing was cached so the next play retries. */
    | { status: 'failed' };

export const getYoutubeMatchCacheKey = (videoId: string): string => `youtube_match_${videoId}`;

/** Resolves lyrics for a YouTube song: cached hit, cached miss, or a fresh QQ lookup that is then cached. */
export const resolveYoutubeLyrics = async (
    videoId: string,
    song: Pick<SongResult, 'name' | 'artists' | 'durationMs'>,
): Promise<YoutubeLyricsOutcome> => {
    const cacheKey = getYoutubeMatchCacheKey(videoId);
    const cached = await getFromCacheWithMigration<YoutubeMatchRecord>(cacheKey, migrateMatchedLyricsCarrierRenderHints);
    if (hasRenderableLyrics(cached?.matchedLyrics)) {
        return { status: 'matched', lyrics: cached.matchedLyrics, qqMid: cached.qqMid };
    }
    if (cached?.noMatch) return { status: 'none' };

    try {
        const match = await matchQqLyricsForYoutube({
            title: song.name,
            artist: song.artists.map(artist => artist.name).filter(Boolean).join(', '),
            durationMs: song.durationMs,
        });
        const record: YoutubeMatchRecord = match
            ? { matchedLyrics: match.lyrics, qqMid: match.song.qqMid, qqSongId: match.song.id, score: match.score, checkedAt: Date.now() }
            : { noMatch: true, checkedAt: Date.now() };
        await saveToCache(cacheKey, record);
        return match ? { status: 'matched', lyrics: match.lyrics, qqMid: match.song.qqMid } : { status: 'none' };
    } catch (error) {
        if (!(error instanceof YoutubeLyricsLookupError)) console.warn('[YouTube] Lyric lookup crashed', error);
        else console.warn('[YouTube] Lyric lookup failed; will retry on next play:', error.message);
        return { status: 'failed' };
    }
};
