import type { UnifiedSong } from '../../types';
import type { YoutubeImportedTrack } from '../../types/youtube';
import { parseYoutubeTrackMetadata } from '../../utils/youtube/parseYoutubeTrackMetadata';

// src/services/youtube/buildYoutubeSong.ts
// Maps an imported YouTube track onto the unified song shape the player, queue and caches share.

/** Identity of a YouTube song in queues, theme caches and persisted sessions. */
export const getYoutubeSongId = (videoId: string): string => `youtube:${videoId}`;

/** Builds the player-facing song; title/artist go through the same cleaner the lyric matcher uses. */
export const buildYoutubeSong = (track: YoutubeImportedTrack): UnifiedSong => {
    const { title, artist } = parseYoutubeTrackMetadata({
        title: track.title,
        track: track.track,
        artist: track.artist,
        uploader: track.uploader,
        channel: track.channel,
    });
    return {
        id: getYoutubeSongId(track.videoId),
        name: title,
        artists: artist ? [{ id: 0, name: artist }] : [],
        album: { id: 0, name: track.album ?? '', ...(track.thumbnailUrl ? { coverUrl: track.thumbnailUrl } : {}) },
        durationMs: track.durationMs,
        sourceRef: { kind: 'youtube', mediaId: track.videoId },
        youtubeAudioUrl: track.audioUrl,
    };
};
