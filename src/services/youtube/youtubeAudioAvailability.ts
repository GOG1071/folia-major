// src/services/youtube/youtubeAudioAvailability.ts
// Checks whether an imported track's cached audio can still be served by the folia-youtube scheme.

/** HEAD against the privileged scheme: 200 while the file exists, 404 once the cache dropped it. */
export const isYoutubeAudioAvailable = async (audioUrl: string | undefined | null): Promise<boolean> => {
    if (!audioUrl || !audioUrl.startsWith('folia-youtube://')) return false;
    try {
        const response = await fetch(audioUrl, { method: 'HEAD' });
        return response.ok;
    } catch {
        return false;
    }
};
