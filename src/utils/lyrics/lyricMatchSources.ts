import type { LyricData, LyricProviderSource, SongResult } from '../../types';
import { calculateMatchScore } from './matchScore';
import { searchQQLyrics, fetchQQLyrics } from './providers/qqLyricProvider';
import { fetchLrclibLyrics, searchLrclibLyrics } from './providers/lrclibLyricProvider';
import { LYRIC_PROVIDER_SOURCES } from './lyricProviderSource';
import { hasRenderableLyrics } from './validity';

// src/utils/lyrics/lyricMatchSources.ts

export type LyricMatchSearchTarget = {
    title: string;
    artist: string;
    durationMs: number;
    album?: string;
};

export type LyricMatchFetchResult = {
    lyrics: LyricData | null;
    isPureMusic: boolean;
};

export const LYRIC_MATCH_SOURCES: readonly LyricProviderSource[] = LYRIC_PROVIDER_SOURCES;

const sortByMatchScore = (songs: SongResult[], target: LyricMatchSearchTarget) => (
    [...songs].sort((a, b) => calculateMatchScore(target, b) - calculateMatchScore(target, a))
);

export async function searchLyricsByMatchSource(
    source: LyricProviderSource,
    query: string,
    target: LyricMatchSearchTarget,
): Promise<SongResult[]> {
    if (source === 'lrclib') {
        return sortByMatchScore(await searchLrclibLyrics(query), target);
    }
    return sortByMatchScore(await searchQQLyrics(query), target);
}

export async function fetchLyricsForMatchSource(
    source: LyricProviderSource,
    selectedResult: SongResult,
): Promise<LyricMatchFetchResult | null> {
    if (source === 'lrclib') {
        return await fetchLrclibLyrics(selectedResult);
    }
    const lyrics = await fetchQQLyrics(selectedResult);
    return {
        lyrics: hasRenderableLyrics(lyrics) ? lyrics : null,
        isPureMusic: false,
    };
}
