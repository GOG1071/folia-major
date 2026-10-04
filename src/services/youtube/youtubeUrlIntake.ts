import { parseYoutubeVideoId } from '../../utils/youtube/youtubeVideoId';

// src/services/youtube/youtubeUrlIntake.ts
// Lets every search entry point (overlay, home box, command palette) divert a pasted YouTube link to
// playback without each of them importing the playback controller.

type YoutubeUrlHandler = (url: string) => void | Promise<unknown>;

let handler: YoutubeUrlHandler | null = null;

/** Registered by the playback controller on mount; pass null on unmount. */
export const setYoutubeUrlHandler = (next: YoutubeUrlHandler | null): void => {
    handler = next;
};

/** Returns true when `query` was a YouTube link and playback took it, so the caller must not search. */
export const tryHandleYoutubeUrlQuery = (query: string): boolean => {
    if (!handler || !parseYoutubeVideoId(query)) return false;
    void handler(query.trim());
    return true;
};
