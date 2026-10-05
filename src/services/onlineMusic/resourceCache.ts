import type { ReplayGainInfo, SongResult } from '../../types';
import type { MigrationResult } from '../../utils/lyrics/renderHints';
import { getCachedAudioBlob, hasCachedAudio } from '../audioCache';
import { getCachedCoverUrl, hasCachedCover } from '../coverCache';
import { getFromCache, saveToCache } from '../db';
import { getSongResourceCacheKey, type SongResourceKind } from './resourceKeys';

// src/services/onlineMusic/resourceCache.ts

const identityMigration = <T>(value: T): MigrationResult<T> => ({ value, changed: false });

// Reads a cached value under the provider-aware key and migrates its stored shape on read when needed.
// (The name predates the removal of the NetEase pre-prefix key scheme it once also migrated.)
export const getSongCacheWithLegacyMigration = async <T>(
    kind: SongResourceKind,
    song: SongResult,
    migrate: (value: T) => MigrationResult<T> = identityMigration,
): Promise<T | null> => {
    const cacheKey = getSongResourceCacheKey(kind, song);
    const current = await getFromCache<T>(cacheKey);
    if (current != null) {
        const migrated = migrate(current);
        if (migrated.changed) void saveToCache(cacheKey, migrated.value);
        return migrated.value;
    }
    return null;
};

export const getCachedSongAudioBlob = async (song: SongResult): Promise<Blob | null> => {
    const cacheKey = getSongResourceCacheKey('audio', song);
    const current = await getCachedAudioBlob(cacheKey);
    return current ?? null;
};

export const hasCachedSongAudio = async (song: SongResult): Promise<boolean> => {
    const cacheKey = getSongResourceCacheKey('audio', song);
    return await hasCachedAudio(cacheKey);
};

/**
 * The cover half of `hasCachedSongAudio`, and separate from it on purpose.
 *
 * The two caches are pruned independently - `cacheRepository` files them under different categories -
 * so "audio present, cover gone" is a state a listener reaches by normal use, not an edge case. Asked
 * on its own so a cover can be refilled without the audio needing to be missing too.
 */
export const hasCachedSongCover = async (song: SongResult): Promise<boolean> => {
    return await hasCachedCover(getSongResourceCacheKey('cover', song));
};

/**
 * ReplayGain, kept for as long as the audio it describes.
 *
 * It arrives only with an audio URL from the provider, and the whole point of the media cache is
 * never to ask for that URL again - so a track played from cache used to reach the fader with no
 * gain at all and silently fall back to 0dB. In album mode that is the one outcome the feature
 * exists to prevent: in a real listen, fifteen cached tracks played at 0dB while the sixteenth,
 * the only one whose URL had just been fetched, played 10.4dB down. A step that size mid-album is
 * far worse than no ReplayGain at all, and it got worse the more of an album was cached.
 *
 * Stored under the song's own resource key, beside the audio, the lyric and the cover.
 */
export const getCachedSongReplayGain = async (song: SongResult): Promise<ReplayGainInfo | undefined> => (
    await getFromCache<ReplayGainInfo>(getSongResourceCacheKey('replayGain', song)) ?? undefined
);

export const saveSongReplayGain = async (song: SongResult, replayGain: ReplayGainInfo): Promise<void> => {
    await saveToCache(getSongResourceCacheKey('replayGain', song), replayGain);
};

export const getCachedSongCoverUrl = async (song: SongResult): Promise<string | null> => {
    const cacheKey = getSongResourceCacheKey('cover', song);
    return await getCachedCoverUrl(cacheKey) || null;
};
