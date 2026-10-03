import i18n from '../../i18n/config';
import type { UnifiedSong } from '../../types';
import type { YoutubeImportErrorCode } from '../../types/youtube';
import { setStatusMessage } from '../../stores/useStatusMessageStore';
import { parseYoutubeVideoId } from '../../utils/youtube/youtubeVideoId';
import { buildYoutubeSong } from './buildYoutubeSong';

// src/services/youtube/youtubeImportService.ts
// Renderer side of "paste a YouTube link": validates, drives the Electron importer and reports progress.

const ERROR_STATUS_KEYS: Record<YoutubeImportErrorCode, string> = {
    'ytdlp-missing': 'status.youtubeYtdlpMissing',
    'invalid-url': 'status.youtubeInvalidUrl',
    'download-failed': 'status.youtubeDownloadFailed',
    timeout: 'status.youtubeTimeout',
};

/** Imports the audio behind a YouTube URL and returns the song to play, or null after reporting why not. */
export const importYoutubeSong = async (url: string): Promise<UnifiedSong | null> => {
    const bridge = typeof window === 'undefined' ? undefined : window.electron?.youtube;
    if (!bridge) {
        setStatusMessage({ type: 'error', text: i18n.t('status.youtubeDesktopOnly') });
        return null;
    }
    const videoId = parseYoutubeVideoId(url);
    if (!videoId) {
        setStatusMessage({ type: 'error', text: i18n.t('status.youtubeInvalidUrl') });
        return null;
    }

    setStatusMessage({ type: 'info', text: i18n.t('status.youtubeDownloading') });
    const stopProgress = bridge.onImportProgress(progress => {
        if (progress.videoId !== videoId) return;
        setStatusMessage({ type: 'info', text: i18n.t('status.youtubeDownloadingPercent', { percent: progress.percent }) });
    });
    try {
        const result = await bridge.importTrack(url);
        if (!result.ok) {
            setStatusMessage({ type: 'error', text: i18n.t(ERROR_STATUS_KEYS[result.code] ?? 'status.youtubeDownloadFailed') });
            return null;
        }
        return buildYoutubeSong(result.track);
    } catch (error) {
        console.error('[YouTube] Import IPC failed', error);
        setStatusMessage({ type: 'error', text: i18n.t('status.youtubeDownloadFailed') });
        return null;
    } finally {
        stopProgress();
    }
};
