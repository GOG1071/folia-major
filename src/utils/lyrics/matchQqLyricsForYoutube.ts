import type { LyricData, SongResult } from '../../types';
import { calculateMatchScoreDetails } from './matchScore';
import { buildLyricSearchQuery } from './searchQuery';
import { fetchQQLyrics, searchQQLyrics } from './providers/qqLyricProvider';
import { hasRenderableLyrics } from './validity';

// src/utils/lyrics/matchQqLyricsForYoutube.ts
// Finds QQ Music lyrics for a YouTube upload from its parsed title/artist/duration.

/**
 * Minimum accepted score. Lower than autoMatchBestLyric's 75 on purpose: a YouTube uploader is rarely
 * the song's artist name (channels, labels, re-uploads) and there is no album to corroborate, so even a
 * correct title+artist hit loses points that a library track would not.
 */
export const YOUTUBE_QQ_MATCH_MIN_SCORE = 55;
const SEARCH_PAGE_SIZE = 10;
const SEARCH_TIMEOUT_MS = 6000;
const LYRIC_FETCH_TIMEOUT_MS = 8000;

export interface YoutubeLyricsMatch {
    lyrics: LyricData;
    song: SongResult;
    score: number;
}

/** A lookup that could not finish (timeout, failed fetch): the caller must not cache it as "no lyrics". */
export class YoutubeLyricsLookupError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'YoutubeLyricsLookupError';
    }
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new YoutubeLyricsLookupError(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * "告白氣球 Love Confession" is one title on YouTube but a catalogue lists "告白气球": besides the full
 * text, offers the CJK-only and Latin-only halves so either spelling can match.
 */
const bilingualVariants = (text: string): string[] => {
    const tokens = text.split(/\s+/u).filter(Boolean);
    const cjk = tokens.filter(token => CJK_PATTERN.test(token)).join(' ');
    const latin = tokens.filter(token => !CJK_PATTERN.test(token)).join(' ');
    return [...new Set([text, cjk, latin].filter(Boolean))];
};

/**
 * Scores one candidate against every title/artist spelling the upload offers. A video's length is a weak
 * signal (intros, outros, MV cuts), so the duration-penalised score is compared with a duration-neutral
 * one and the better counts: a matching duration still lifts the right version, but a long MV never
 * sinks a correct title+artist match.
 */
const scoreCandidate = (target: { title: string; artist: string; durationMs: number }, candidate: SongResult) => {
    let best = { titleMatched: false, score: 0 };
    for (const title of bilingualVariants(target.title)) {
        for (const artist of target.artist.trim() ? bilingualVariants(target.artist) : ['']) {
            const withDuration = calculateMatchScoreDetails({ title, artist, durationMs: target.durationMs }, candidate);
            const neutral = calculateMatchScoreDetails({ title, artist, durationMs: 0 }, candidate);
            const titleMatched = withDuration.titleMatched;
            const score = Math.max(withDuration.score, neutral.score);
            // A variant that matches the title always outranks one that does not, so a matched title is never lost.
            if ((titleMatched && !best.titleMatched) || (titleMatched === best.titleMatched && score > best.score)) {
                best = { titleMatched, score };
            }
        }
    }
    return best;
};

const pickBestCandidate = (
    target: { title: string; artist: string; durationMs: number },
    candidates: SongResult[],
): { song: SongResult; score: number } | null => {
    let best: { song: SongResult; score: number } | null = null;
    for (const candidate of candidates) {
        const { titleMatched, score } = scoreCandidate(target, candidate);
        if (!titleMatched) continue;
        if (!best || score > best.score) best = { song: candidate, score };
    }
    return best && best.score >= YOUTUBE_QQ_MATCH_MIN_SCORE ? best : null;
};

// `rethrow` because searchQQLyrics otherwise turns a rate-limit or network failure into [] — which would be
// remembered as "QQ has no match" for a song that was never actually looked up.
const searchCandidates = async (query: string): Promise<SongResult[]> => {
    if (!query) return [];
    try {
        return await withTimeout(searchQQLyrics(query, 1, SEARCH_PAGE_SIZE, { rethrow: true }), SEARCH_TIMEOUT_MS, 'QQ search');
    } catch (error) {
        if (error instanceof YoutubeLyricsLookupError) throw error;
        throw new YoutubeLyricsLookupError(`QQ search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * Returns the highest-scoring QQ candidate whose title matches, if it clears the threshold and its lyrics
 * render; null when QQ has no acceptable match. Throws YoutubeLyricsLookupError when the lookup itself
 * could not complete, so a network hiccup is never remembered as "this song has no lyrics".
 */
export const matchQqLyricsForYoutube = async (
    { title, artist, durationMs }: { title: string; artist: string; durationMs: number },
): Promise<YoutubeLyricsMatch | null> => {
    const target = { title, artist, durationMs };
    let candidates = await searchCandidates(buildLyricSearchQuery(title, artist));
    let best = pickBestCandidate(target, candidates);
    // The artist guess is the shakiest part of a YouTube title; retry with the title alone before giving up.
    if (!best && artist.trim()) {
        candidates = await searchCandidates(buildLyricSearchQuery(title, ''));
        best = pickBestCandidate(target, candidates);
    }
    if (!best) return null;

    const lyrics = await withTimeout(fetchQQLyrics(best.song), LYRIC_FETCH_TIMEOUT_MS, 'QQ lyric fetch');
    // fetchQQLyrics swallows its own errors and returns null, so null here cannot tell "no lyrics" from
    // "request failed": treat it as a failed lookup and let the next play retry.
    if (!lyrics) throw new YoutubeLyricsLookupError('QQ returned no lyric payload');
    if (!hasRenderableLyrics(lyrics)) return null;
    return { lyrics, song: best.song, score: best.score };
};
