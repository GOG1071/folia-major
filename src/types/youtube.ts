// src/types/youtube.ts
// Contracts shared by the Electron YouTube importer (main process) and the renderer playback flow.

export type YoutubeImportErrorCode = 'ytdlp-missing' | 'invalid-url' | 'download-failed' | 'timeout';

/** What the main process hands back after yt-dlp finished (or the cache already held the audio). */
export interface YoutubeImportedTrack {
    videoId: string;
    title: string;
    /** yt-dlp `track`: set for YouTube Music auto-generated videos. */
    track?: string;
    artist?: string;
    uploader?: string;
    channel?: string;
    album?: string;
    durationMs: number;
    thumbnailUrl?: string;
    /** `folia-youtube://audio/<id>`, served by the privileged scheme in electron/youtube/protocol.cjs. */
    audioUrl: string;
}

export type YoutubeImportResult =
    | { ok: true; track: YoutubeImportedTrack }
    | { ok: false; code: YoutubeImportErrorCode; message: string };

export interface YoutubeImportProgress {
    videoId: string;
    percent: number;
}

/** The slice of `window.electron.youtube` the renderer consumes. */
export interface ElectronYoutubeBridge {
    importTrack: (url: string) => Promise<YoutubeImportResult>;
    onImportProgress: (callback: (progress: YoutubeImportProgress) => void) => () => void;
}
