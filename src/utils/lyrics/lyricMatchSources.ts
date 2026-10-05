import type { LyricData, LyricProviderSource, SongResult } from '../../types';
import { calculateMatchScore } from './matchScore';
import { searchQQLyrics, fetchQQLyrics } from './providers/qqLyricProvider';
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
    _source: LyricProviderSource,
    query: string,
    target: LyricMatchSearchTarget,
): Promise<SongResult[]> {
    return sortByMatchScore(await searchQQLyrics(query), target);
}

export async function fetchLyricsForMatchSource(
    _source: LyricProviderSource,
    selectedResult: SongResult,
): Promise<LyricMatchFetchResult | null> {
    const lyrics = await fetchQQLyrics(selectedResult);
    return {
        lyrics: hasRenderableLyrics(lyrics) ? lyrics : null,
        isPureMusic: false,
    };
}
