import { LyricData, LyricProviderSource, SongResult } from '../../types';
import type { ChorusRange, ProviderLyricsResult } from '../../types/onlineMusic';
import { searchQQLyrics, fetchQQLyrics } from './providers/qqLyricProvider';
import { normalizeLyricMatchDurationMs } from './duration';
import { calculateMatchScoreDetails } from './matchScore';
import { buildLyricSearchQuery } from './searchQuery';
import { hasRenderableLyrics } from './validity';

// src/utils/lyrics/autoMatchBestLyric.ts
// Utility module for preferring word-by-word lyrics while retaining a usable line-by-line fallback.

const PROVIDER_SEARCH_TIMEOUT_MS = 3500;
const PROVIDER_LYRIC_TIMEOUT_MS = 5000;
const AUTO_MATCH_SEARCH_LIMIT = 10;
const AUTO_MATCH_MIN_SCORE = 75;
const SHOULD_LOG_MATCH_DETAILS = import.meta.env.DEV;

export interface AutoMatchProviderCandidate {
    providerId: 'qq';
    song: SongResult;
    lyricsResult: ProviderLyricsResult;
}

export interface AutoMatchBestLyricOptions {
    album?: string;
    metadataCandidate?: {
        source: 'qq';
        songId: number | string;
    };
    exactMatchOnly?: boolean;
    providerCandidate?: AutoMatchProviderCandidate;
}

export type AutoMatchBestLyricMatch = {
    lyrics: LyricData;
    source: LyricProviderSource;
    id: number | string;
    qqMid?: string;
    song: SongResult;
    isPureMusic?: false;
};

export type AutoMatchBestLyricPureMusic = {
    isPureMusic: true;
    source?: LyricProviderSource;
    id?: number | string;
};

export type AutoMatchBestLyricResult = AutoMatchBestLyricMatch | AutoMatchBestLyricPureMusic | null;

const isSelectedMetadataCandidate = (
    song: SongResult,
    candidate?: AutoMatchBestLyricOptions['metadataCandidate'],
): boolean => {
    if (!candidate || candidate.source !== 'qq') return false;
    return String(song.qqMid ?? song.id) === String(candidate.songId);
};

function selectBestCandidate(
    source: LyricProviderSource,
    songs: SongResult[],
    target: { title: string; artist: string; durationMs: number; album?: string }
): SongResult | null {
    const isReliableCandidate = (details: ReturnType<typeof calculateMatchScoreDetails>) =>
        details.titleMatched && (details.artistMatched || details.albumMatched === true);

    const scored = songs
        .slice(0, AUTO_MATCH_SEARCH_LIMIT)
        .map(song => ({
            song,
            details: calculateMatchScoreDetails(target, song)
        }))
        .sort((a, b) => b.details.score - a.details.score);

    if (SHOULD_LOG_MATCH_DETAILS) {
        for (const item of scored) {
            console.log(
                `[autoMatchBestLyric] ${source} candidate "${item.song.name}" score=${item.details.score} ` +
                `(title=${item.details.titleMatched ? 'hit' : 'miss'}, artist=${item.details.artistMatched ? 'hit' : 'miss'}, ` +
                `album=${item.details.albumMatched === null ? 'n/a' : (item.details.albumMatched ? 'hit' : 'miss')}, ` +
                `duration=${item.details.durationMatched === null ? 'n/a' : (item.details.durationMatched ? 'hit' : 'miss')})`
            );
        }
    }

    const best = scored.find(item => isReliableCandidate(item.details)) ?? scored[0];
    if (!best) {
        return null;
    }

    console.log(`[autoMatchBestLyric] Best ${source} candidate: "${best.song.name}" score=${best.details.score}`);
    if (!isReliableCandidate(best.details)) {
        console.log(`[autoMatchBestLyric] Skipping ${source} candidate because title and identity fields did not match`);
        return null;
    }
    if (best.details.score < AUTO_MATCH_MIN_SCORE) {
        console.log(`[autoMatchBestLyric] Skipping ${source} candidate because score ${best.details.score} is below ${AUTO_MATCH_MIN_SCORE}`);
        return null;
    }

    return best.song;
}

// Bounds slow remote providers so one source cannot block the whole automatic match.
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((resolve) => {
                timer = setTimeout(() => {
                    console.warn(`[autoMatchBestLyric] ${label} timed out after ${timeoutMs}ms`);
                    resolve(fallback);
                }, timeoutMs);
            })
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

/**
 * Searches and matches the best lyric on QQ Music.
 * A word-by-word result is returned immediately; a line-by-line result is kept as the fallback.
 * Returns the parsed lyrics and matching details, or null if no reliable match is found.
 */
export async function autoMatchBestLyric(
    title: string,
    artist: string,
    durationMs: number,
    options: AutoMatchBestLyricOptions = {}
): Promise<AutoMatchBestLyricResult> {
    const searchQuery = buildLyricSearchQuery(title, artist, options.album);
    const normalizedDurationMs = normalizeLyricMatchDurationMs(durationMs);
    console.log(`[autoMatchBestLyric] Initiating best lyric auto-match for "${searchQuery}" (Duration: ${normalizedDurationMs}ms)`);
    const targetSong = { title, artist, album: options.album, durationMs: normalizedDurationMs };
    const providerCandidate = options.providerCandidate;
    const providerChorusRanges: ChorusRange[] = providerCandidate?.lyricsResult.chorusRanges ?? [];

    const getQqBestCandidate = async (): Promise<SongResult | null> => {
        if (providerCandidate?.providerId === 'qq') {
            return providerCandidate.song;
        }
        const qqSongs = (await withTimeout(
            searchQQLyrics(searchQuery, 1, AUTO_MATCH_SEARCH_LIMIT),
            PROVIDER_SEARCH_TIMEOUT_MS,
            'QQ search',
            []
        )) ?? [];
        if (options.metadataCandidate?.source === 'qq') {
            const exactCandidate = qqSongs.find(song => isSelectedMetadataCandidate(song, options.metadataCandidate));
            if (exactCandidate || options.exactMatchOnly) {
                return exactCandidate ?? null;
            }
        }
        return selectBestCandidate('qq', qqSongs, targetSong);
    };

    const getQqProcessed = async (song: SongResult): Promise<ProviderLyricsResult | null> => {
        const songIdentity = String(song.qqMid ?? (
            song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : song.id
        ));
        const candidateIdentity = providerCandidate?.providerId === 'qq'
            ? String(providerCandidate.song.qqMid ?? (
                providerCandidate.song.sourceRef?.kind === 'online'
                    ? providerCandidate.song.sourceRef.mediaId
                    : providerCandidate.song.id
            ))
            : '';
        if (providerCandidate?.providerId === 'qq' && candidateIdentity === songIdentity) {
            return providerCandidate.lyricsResult;
        }

        const lyrics = await withTimeout(
            fetchQQLyrics(song, { chorusRanges: providerChorusRanges }),
            PROVIDER_LYRIC_TIMEOUT_MS,
            `QQ lyric fetch for ${song.id}`,
            null,
        );
        return lyrics ? { lyrics, isPureMusic: false } : null;
    };

    let lineByLineFallback: AutoMatchBestLyricMatch | null = null;

    try {
        const bestCandidate = await getQqBestCandidate();
        const candidateSongs = bestCandidate ? [bestCandidate] : [];

        for (const song of candidateSongs) {
            console.log(`[autoMatchBestLyric] Checking QQ candidate: "${song.name}" by "${song.artists?.map((a: any) => a.name).join(', ')}"`);
            const processed = await getQqProcessed(song);
            if (processed?.isPureMusic) {
                return { isPureMusic: true, source: 'qq', id: song.id };
            }
            const parsedLyrics = processed?.lyrics ?? null;
            const acceptsExactNonWordByWord = options.exactMatchOnly
                && isSelectedMetadataCandidate(song, options.metadataCandidate);
            if (hasRenderableLyrics(parsedLyrics)) {
                const match: AutoMatchBestLyricMatch = {
                    lyrics: parsedLyrics,
                    source: 'qq',
                    id: song.id,
                    qqMid: song.qqMid,
                    song,
                };
                if (parsedLyrics.isWordByWord || acceptsExactNonWordByWord) {
                    console.log(`[autoMatchBestLyric] Found accepted QQ lyric match!`);
                    return match;
                }
                lineByLineFallback ??= match;
                console.log(`[autoMatchBestLyric] Keeping QQ line-by-line lyrics as fallback.`);
            }
        }
    } catch (error) {
        console.error(`[autoMatchBestLyric] QQ search/fetch failed:`, error);
    }

    if (lineByLineFallback) {
        console.log(`[autoMatchBestLyric] No word-by-word lyric match found; using ${lineByLineFallback.source} line-by-line fallback.`);
        return lineByLineFallback;
    }

    console.log(`[autoMatchBestLyric] No reliable lyric match found.`);
    return null;
}
