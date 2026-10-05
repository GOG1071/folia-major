import type { LocalSong, SongResult } from '../types';
import type { LocalSongMetadataSource } from '../types/localLibrary';
import { getProviderSongMetadata } from './onlineMusic/songMetadata';
import { searchQQLyrics } from '../utils/lyrics/providers/qqLyricProvider';
import { calculateMatchScoreDetails } from '../utils/lyrics/matchScore';
import { buildLyricSearchQuery } from '../utils/lyrics/searchQuery';
import {
    getMatchResultAlbumId,
    getMatchResultAlbumName,
    getMatchResultArtistEntities,
    getMatchResultCoverUrl,
} from '../utils/lyrics/matchResult';

// src/services/onlineMetadataSearchService.ts
// Searches song metadata without invoking any lyric provider or lyric download path.

export type OnlineMetadataSource = LocalSongMetadataSource;

export interface OnlineMetadataSearchTarget {
    title: string;
    artist: string;
    album?: string;
    durationMs: number;
}

export interface OnlineMetadataCandidate {
    source: OnlineMetadataSource;
    songId: number | string;
    title: string;
    artists: Array<{ id?: number | string; name: string }>;
    album?: { id?: number | string; name: string };
    coverUrl?: string;
    durationMs: number;
    score: number;
    titleMatched: boolean;
    durationMatched: boolean | null;
    raw: SongResult;
}

const stripAudioExtension = (fileName: string) => fileName.replace(/\.(mp3|flac|m4a|wav|ogg|opus|aac)$/i, '');

export const buildLocalSongMetadataSearchTarget = (song: LocalSong): OnlineMetadataSearchTarget => ({
    title: song.title || stripAudioExtension(song.fileName),
    artist: song.titleOrigin === 'import'
        ? song.importedMetadata.artistNames.join(', ')
        : song.onlineMetadata?.artists.map(artist => artist.name).join(', ') || song.importedMetadata.artistNames.join(', '),
    album: song.titleOrigin === 'import'
        ? song.importedMetadata.albumName || ''
        : song.onlineMetadata?.album?.name || song.importedMetadata.albumName || '',
    durationMs: song.duration || 0,
});

export const buildLocalSongMetadataSearchQuery = (song: LocalSong): string => {
    const target = buildLocalSongMetadataSearchTarget(song);
    return buildLyricSearchQuery(target.title, target.artist, target.album);
};

export const normalizeOnlineMetadataCandidate = (
    source: OnlineMetadataSource,
    result: SongResult,
    target: OnlineMetadataSearchTarget,
): OnlineMetadataCandidate => {
    const details = calculateMatchScoreDetails(target, result);
    const albumName = getMatchResultAlbumName(result).trim();
    const albumId = getMatchResultAlbumId(result);
    return {
        source,
        songId: result.qqMid ?? result.id,
        title: result.name || '',
        artists: getMatchResultArtistEntities(result),
        album: albumName ? { id: albumId, name: albumName } : undefined,
        coverUrl: getMatchResultCoverUrl(result, source) || undefined,
        durationMs: getProviderSongMetadata(result, source).durationMs,
        score: details.score,
        titleMatched: details.titleMatched,
        durationMatched: details.durationMatched,
        raw: result,
    };
};

// Only a lyric source that also supplies metadata can seed a candidate (see sourceProvidesSongMetadata).
export const normalizeLyricMatchMetadataCandidate = (
    lyricSource: OnlineMetadataSource,
    result: SongResult,
    target: OnlineMetadataSearchTarget,
): OnlineMetadataCandidate => {
    return normalizeOnlineMetadataCandidate(lyricSource, result, target);
};

const throwIfAborted = (signal?: AbortSignal) => {
    if (!signal?.aborted) return;
    const error = new Error('Metadata matching was cancelled');
    error.name = 'AbortError';
    throw error;
};

// Stops waiting immediately when a provider client cannot receive AbortSignal directly.
const waitForProvider = async <T>(request: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return await request;
    throwIfAborted(signal);
    return await new Promise<T>((resolve, reject) => {
        const abort = () => {
            const error = new Error('Metadata matching was cancelled');
            error.name = 'AbortError';
            reject(error);
        };
        signal.addEventListener('abort', abort, { once: true });
        request.then(
            value => {
                signal.removeEventListener('abort', abort);
                resolve(value);
            },
            error => {
                signal.removeEventListener('abort', abort);
                reject(error);
            },
        );
    });
};

export async function searchOnlineMetadata(
    source: OnlineMetadataSource,
    query: string,
    target: OnlineMetadataSearchTarget,
    options: { limit?: number; signal?: AbortSignal } = {},
): Promise<OnlineMetadataCandidate[]> {
    const safeQuery = query.trim();
    if (!safeQuery) return [];
    throwIfAborted(options.signal);
    const limit = options.limit ?? 10;
    const results = await waitForProvider(searchQQLyrics(safeQuery, 1, limit), options.signal);
    throwIfAborted(options.signal);
    return results
        .map(result => normalizeOnlineMetadataCandidate(source, result, target))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
}

// Picks the best title-matching QQ Music candidate for a local song, or null when nothing matches.
export async function findAutomaticOnlineMetadataCandidate(
    song: LocalSong,
    signal?: AbortSignal,
): Promise<OnlineMetadataCandidate | null> {
    const target = buildLocalSongMetadataSearchTarget(song);
    const query = buildLocalSongMetadataSearchQuery(song);
    try {
        const qqCandidates = await searchOnlineMetadata('qq', query, target, { limit: 10, signal });
        if (qqCandidates[0]?.titleMatched) return qqCandidates[0];
    } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        console.warn('[LocalMusic] QQ metadata search failed:', error);
    }
    return null;
}
