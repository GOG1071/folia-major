import { useCallback, useEffect, useRef } from 'react';
import { importYoutubeSong } from '../services/youtube/youtubeImportService';
import { setYoutubeUrlHandler } from '../services/youtube/youtubeUrlIntake';
import { parseYoutubeVideoId } from '../utils/youtube/youtubeVideoId';
import type { SongResult } from '../types';

// src/hooks/useYoutubeUrlPlayback.ts
// "Play this YouTube link": import the audio, then play it like a single clicked search result.

type UseYoutubeUrlPlaybackParams = {
    /** Appends the song to the current queue when absent and plays it (the search-result click path). */
    playQueueSong: (song: SongResult) => void;
};

export function useYoutubeUrlPlayback({ playQueueSong }: UseYoutubeUrlPlaybackParams) {
    const inFlightRef = useRef(new Set<string>());

    const playYoutubeUrl = useCallback(async (url: string): Promise<boolean> => {
        const videoId = parseYoutubeVideoId(url);
        // A second paste of a link that is still downloading would only queue a duplicate play.
        if (videoId && inFlightRef.current.has(videoId)) return true;
        if (videoId) inFlightRef.current.add(videoId);
        try {
            const song = await importYoutubeSong(url);
            if (!song) return false;
            playQueueSong(song);
            return true;
        } finally {
            if (videoId) inFlightRef.current.delete(videoId);
        }
    }, [playQueueSong]);

    // Search entry points divert pasted links here without importing this controller.
    useEffect(() => {
        setYoutubeUrlHandler(playYoutubeUrl);
        return () => setYoutubeUrlHandler(null);
    }, [playYoutubeUrl]);

    return { playYoutubeUrl };
}
