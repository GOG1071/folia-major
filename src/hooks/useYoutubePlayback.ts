import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerState } from '../types';
import type { LyricData, SongResult, UnifiedSong } from '../types';
import type { PlaybackNavigationOptions } from '../types/appPlayback';
import type { ThemeCacheSongKey } from '../services/themeCache';
import { getCachedSongCoverUrl } from '../services/onlineMusic/resourceCache';
import { retireBlobUrl } from '../services/playbackBlobUrls';
import { isYoutubeAudioAvailable } from '../services/youtube/youtubeAudioAvailability';
import { resolveYoutubeLyrics } from '../services/youtube/youtubeLyricsResolver';
import { getPlaybackSongKey, isSamePlaybackSong, replacePlaybackSongInQueue } from '../utils/appPlaybackGuards';
import { setStatusMessage as setStatusMsg } from '../stores/useStatusMessageStore';
import { setAudioSrc, setCachedCoverUrl, setCurrentLineIndex, setCurrentSong, setPlayQueue, setPlayerState } from '../stores/usePlaybackStore';
import { currentTime } from '../stores/motionSignals';

// src/hooks/useYoutubePlayback.ts
// Plays a track imported from YouTube: cached audio over folia-youtube://, QQ lyrics matched automatically.

type UseYoutubePlaybackParams = {
    setLyrics: (nextLyrics: LyricData | null) => void;
    setIsLyricsLoading: (loading: boolean) => void;
    navigateToPlaybackView: () => void;
    persistLastPlaybackCache: (song: SongResult | null, queue: SongResult[]) => Promise<void>;
    restoreCachedThemeForSong: (songOrId: ThemeCacheSongKey | SongResult, options?: {
        allowLastUsedFallback?: boolean;
        preserveCurrentOnMiss?: boolean;
    }) => Promise<unknown>;
    interruptStagePlaybackForMainTransition: () => unknown;
    blobUrlRef: MutableRefObject<string | null>;
    shouldAutoPlayRef: MutableRefObject<boolean>;
    currentSongRef: MutableRefObject<string | number | null>;
    currentOnlineAudioUrlFetchedAtRef: MutableRefObject<number | null>;
};

// Mirrors the Navidrome handler's state sequence, but resolves lyrics after the song is already playing.
export function useYoutubePlayback({
    setLyrics,
    setIsLyricsLoading,
    navigateToPlaybackView,
    persistLastPlaybackCache,
    restoreCachedThemeForSong,
    interruptStagePlaybackForMainTransition,
    blobUrlRef,
    shouldAutoPlayRef,
    currentSongRef,
    currentOnlineAudioUrlFetchedAtRef,
}: UseYoutubePlaybackParams) {
    const { t } = useTranslation();

    const onPlayYoutubeSong = useCallback(async (
        song: UnifiedSong,
        queue: SongResult[] = [],
        options: PlaybackNavigationOptions = {},
    ) => {
        interruptStagePlaybackForMainTransition();

        const audioUrl = song.youtubeAudioUrl;
        if (!audioUrl || !(await isYoutubeAudioAvailable(audioUrl))) {
            setStatusMsg({ type: 'error', text: t('status.youtubeAudioMissing') });
            setIsLyricsLoading(false);
            return;
        }

        const songKey = getPlaybackSongKey(song);
        // Handed over, not revoked: see retireBlobUrl (a blend may still be playing the previous song).
        retireBlobUrl(blobUrlRef.current);
        blobUrlRef.current = null;
        // The cached file never expires, so the online URL refresh/recovery path must stay idle.
        currentOnlineAudioUrlFetchedAtRef.current = null;
        shouldAutoPlayRef.current = true;
        currentSongRef.current = songKey;

        setLyrics(null);
        setCurrentLineIndex(-1);
        currentTime.set(0);
        setCurrentSong(song);
        setAudioSrc(audioUrl);
        setCachedCoverUrl(song.album.coverUrl ?? null);
        setIsLyricsLoading(true);

        const finalQueue = options.unifiedQueue
            ? replacePlaybackSongInQueue(options.unifiedQueue, song)
            : queue.length > 0
                ? replacePlaybackSongInQueue(queue, song)
                : [song];
        setPlayQueue(finalQueue);
        void persistLastPlaybackCache(song, finalQueue);

        if (options.shouldNavigateToPlayer ?? true) {
            navigateToPlaybackView();
        }
        setPlayerState(PlayerState.IDLE);
        void restoreCachedThemeForSong(song).catch(error => console.warn('Theme load error', error));
        void getCachedSongCoverUrl(song).then(cachedCover => {
            if (cachedCover && currentSongRef.current === songKey) setCachedCoverUrl(cachedCover);
        });

        // Every await below can outlive this song, so each result is checked against the live song key.
        const outcome = await resolveYoutubeLyrics(song.sourceRef.mediaId, song);
        if (currentSongRef.current !== songKey) return;
        if (outcome.status === 'matched') {
            setLyrics(outcome.lyrics);
            setCurrentSong(prev => (prev && isSamePlaybackSong(prev, song)
                ? { ...prev, matchedLyricsSource: 'qq', qqMid: outcome.qqMid }
                : prev));
        } else if (outcome.status === 'failed') {
            setStatusMsg({ type: 'info', text: t('status.youtubeLyricsLookupFailed') });
        }
        setIsLyricsLoading(false);
    }, [
        blobUrlRef,
        currentOnlineAudioUrlFetchedAtRef,
        currentSongRef,
        interruptStagePlaybackForMainTransition,
        navigateToPlaybackView,
        persistLastPlaybackCache,
        restoreCachedThemeForSong,
        setIsLyricsLoading,
        setLyrics,
        shouldAutoPlayRef,
        t,
    ]);

    return { onPlayYoutubeSong };
}
