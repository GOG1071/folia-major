import type { SongResult } from '../../types';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';

// src/services/onlineMusic/resourceKeys.ts

export type SongResourceKind = 'audio' | 'lyric' | 'cover' | 'theme' | 'replayGain';

export const getSongResourceCacheKey = (kind: SongResourceKind, song: SongResult): string => {
    return `${kind}_${getPlaybackSongKey(song)}`;
};
